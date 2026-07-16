<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { createViewport } from '@/three/viewport.js'
import { toastError, toastInfo, toastSuccess, toastWarning } from '@/services/toast.js'
import { isModelFilename } from '@/shared/modelFileNode.js'
import { formatBedLegend } from '@/utils/viewport-format.js'
import {
	analyzeMesh,
	autoOrient,
	autoRepair,
	layFlat,
	scaleToFitBed,
	scaleToMaxFitBed,
	applyUniformScale,
	mirrorMesh,
	rotationMatrixFromTo,
	applyRotationMatrix,
} from '@/services/mesh-analyze.js'
import { cutMeshByPlane, cutMeshBothHalves } from '@/services/mesh-cut.js'
import { subtract as csgSubtract, union as csgUnion, makeCylinder } from '@/services/mesh-boolean.js'
import { hollowMesh } from '@/services/mesh-hollow.js'
import { makeTextMesh } from '@/services/mesh-emboss.js'
import { arrangeObjects } from '@/services/mesh-arrange.js'

export default {
	name: 'ModelViewport',
	props: {
		file: { type: [File, Blob], default: null },
		buildVolume: {
			type: Array,
			default: () => [220, 220, 220],
		},
	},
	data() {
		return {
			dragOver: false,
			viewport: null,
			viewportReady: false,
			viewportError: '',
			pendingFile: null,
			hasMesh: false,
			previewSkipped: false,
			loadError: '',
			loading: false,
			_transformSyncTimer: null,
		}
	},
	computed: {
		...mapStores(usePrintStore),
		isStlFile() {
			return isModelFilename(this.file?.name) && String(this.file?.name || '').toLowerCase().endsWith('.stl')
		},
		showEmptyDrop() {
			return !this.file && !this.loading && !this.viewportError
		},
		showLoading() {
			return this.loading && !!this.file
		},
		showPreviewSkipped() {
			return !!this.file && this.previewSkipped && !this.loading && !this.viewportError
		},
		showLoadError() {
			return !!this.file && !!this.loadError && !this.loading
		},
		bedLegend() {
			return formatBedLegend(this.buildVolume)
		},
		bedLegendWarn() {
			return !!this.printStore.modelMeta.bbox && !this.printStore.modelMeta.fitsBed
		},
	},
	watch: {
		file: {
			immediate: true,
			handler(f) {
				this.queueLoad(f)
			},
		},
		buildVolume: {
			deep: true,
			handler(vol) {
				this.viewport?.setBedVolume(vol)
			},
		},
	},
	async mounted() {
		const wrap = this.$refs.wrap
		const canvas = this.$refs.canvas
		if (!wrap || !canvas) {
			return
		}
		try {
			this.viewport = await createViewport(canvas, wrap)
			this.viewport.setBedVolume(this.buildVolume)
			this.viewport.setGizmoChangeHandler?.(() => this._scheduleTransformSync())
			// Multi-object selection: viewport → store, and pick-on-click.
			this.viewport.setSelectionChangeHandler?.((id) => {
				this.printStore.selectObject(id)
			})
			this._onSelectClick = (e) => this._maybePickObject(e)
			canvas.addEventListener('pointerdown', this._onSelectClick)
			this.viewportReady = true
			this.viewportError = ''
			this._restoreSavedTransform()
			await this.flushPendingLoad()
		} catch (e) {
			this.viewportError = e?.message || 'WebGL viewport unavailable'
			toastError('3D preview failed to start', e)
		}
	},
	beforeDestroy() {
		if (this._transformSyncTimer) {
			clearTimeout(this._transformSyncTimer)
		}
		if (this._onSelectClick && this.$refs.canvas) {
			this.$refs.canvas.removeEventListener('pointerdown', this._onSelectClick)
		}
		this.viewport?.dispose()
	},
	methods: {
		_restoreSavedTransform() {
			const mt = this.printStore.meshState
			if (!this.viewport?.setTransform || !this.file) {
				return
			}
			if (mt.position || mt.rotation || mt.scale) {
				this.viewport.setTransform({
					position: mt.position,
					rotation: mt.rotation,
					scale: mt.scale,
				})
			}
		},
		_scheduleTransformSync() {
			if (this._transformSyncTimer) {
				clearTimeout(this._transformSyncTimer)
			}
			this._transformSyncTimer = setTimeout(() => {
				this._syncTransformFromViewport()
			}, 150)
		},
		_syncTransformFromViewport() {
			if (!this.viewport?.getTransform) {
				return
			}
			const transform = this.viewport.getTransform()
			if (!transform) {
				return
			}
			this.printStore.setMeshTransform(transform)
			this.printStore.markMeshDirty()
			// A move/scale can push an object past the build volume — refresh the
			// out-of-bed tint + flag list after each transform settles.
			this.printStore.outOfBedIds = this.viewport?.objectsOutOfBed?.() || []
			if (this.printStore.meshState.autoApply) {
				void this.applyToSlice({ silent: true })
			}
		},
		queueLoad(file) {
			this.pendingFile = file || null
			this.loadError = ''
			this.previewSkipped = false
			if (!file) {
				this.hasMesh = false
				// Clearing the model must also remove the rendered mesh from the
				// scene — otherwise the old model stays visible after Clear.
				this.viewport?.clearModelMesh?.()
				return
			}
			void this.flushPendingLoad()
		},
		async flushPendingLoad() {
			const file = this.pendingFile
			if (!file) {
				return
			}
			if (!this.viewportReady || !this.viewport) {
				return
			}
			this.loading = true
			this.loadError = ''
			this.previewSkipped = false
			this.hasMesh = false
			try {
				const loadOptions = this.loadOptionsForFile(file)
				const meta = await this.viewport.loadModel(file, loadOptions)
				if (meta?.previewSkipped) {
					this.previewSkipped = true
					this.hasMesh = false
				} else {
					this.hasMesh = true
					this._restoreSavedTransform()
				}
				this.printStore.setModelMeta(meta)
				if (this.hasMesh) {
					this._syncSceneFromViewport()
					void this.analyzeCurrentMesh()
					await this._applyAfterLoad()
				}
			} catch (e) {
				this.loadError = e?.message || 'Could not load model preview'
				this.hasMesh = false
				if (this.isStlFile) {
					toastError('STL preview failed', e)
				}
				console.warn('[nc_print] viewport load failed:', e?.message || e)
			} finally {
				this.loading = false
			}
		},
		// Click-to-select an object. Skipped in face-pick mode (PrepareTab owns
		// that click) and when the click hits empty space in single-object mode
		// (nothing to deselect). In multi-object mode, empty space deselects.
		_maybePickObject(e) {
			if (this.printStore.facePickMode) {
				return
			}
			const id = this.viewport?.pickObjectAt?.(e.clientX, e.clientY) ?? null
			if (id) {
				this.viewport?.selectObject?.(id) // fires selection handler → store
			} else if (this.printStore.objects.length > 1) {
				this.viewport?.deselect?.()
			}
		},
		selectObjectInViewport(id) {
			this.viewport?.selectObject?.(id)
		},
		// Rebuild the store scene from the viewport's authoritative object list so
		// ids stay in lockstep (the viewport owns object identity while editing).
		// Existing names are preserved by id; new objects get a default name.
		_syncSceneFromViewport() {
			const vpObjects = this.viewport?.listObjects?.() || []
			const prevById = new Map(this.printStore.objects.map((o) => [o.id, o]))
			const baseName = (this.printStore.model.name || 'Object').replace(/\.[^.]+$/, '')
			this.printStore.objects = vpObjects.map((vp, i) => {
				const prev = prevById.get(vp.id)
				return {
					id: vp.id,
					name: prev?.name || (vpObjects.length > 1 ? `${baseName} ${i + 1}` : (this.printStore.model.name || 'Object')),
					sourceKind: prev?.sourceKind || 'file',
					position: prev?.position || [0, 0, 0],
					rotation: prev?.rotation || [0, 0, 0],
					scale: prev?.scale || [1, 1, 1],
					bbox: vp.bbox || prev?.bbox || null,
					triangleCount: prev?.triangleCount || 0,
					visible: prev?.visible !== false,
				}
			})
			// Mirror the viewport's current selection.
			this.printStore.selectedObjectId = this.viewport?.getSelectedId?.() ?? null
			// Refresh out-of-bed tinting + flag list (viewport recomputes bounds and
			// re-applies the red highlight as a side effect).
			this.printStore.outOfBedIds = this.viewport?.objectsOutOfBed?.() || []
		},
		duplicateSelected() {
			const id = this.viewport?.duplicateSelected?.()
			if (id) {
				this._syncSceneFromViewport()
				this._scheduleTransformSync()
			}
			return id
		},
		removeObject(id) {
			this.viewport?.removeObject?.(id)
			this._syncSceneFromViewport()
		},
		listObjects() {
			return this.viewport?.listObjects?.() || []
		},
		recenter() {
			this.viewport?.recenter()
			this._scheduleTransformSync()
		},
		rotateModel(axis, degrees = 90) {
			this.viewport?.rotateModel(axis, degrees)
			this._scheduleTransformSync()
		},
		applyScalePercent(factor) {
			if (!this.viewport?.scaleModelUniform || !Number.isFinite(factor) || factor <= 0) {
				return
			}
			this.viewport.scaleModelUniform(factor)
			this._scheduleTransformSync()
		},
		applyRotationDegrees({ x = 0, y = 0, z = 0 } = {}) {
			if (x) {
				this.rotateModel('x', x)
			}
			if (y) {
				this.rotateModel('y', y)
			}
			if (z) {
				this.rotateModel('z', z)
			}
		},
		async layFlatMesh() {
			const mesh = await this.getMeshSnapshot()
			if (!mesh) {
				return false
			}
			const flat = layFlat(mesh.positions, mesh.indices)
			await this.applyMeshSnapshot({ positions: flat.positions, indices: mesh.indices })
			const result = analyzeMesh(flat.positions, mesh.indices)
			this.printStore.setMeshHealth(result)
			toastSuccess('Largest face placed on bed')
			return true
		},
		async applyToSlice(options = {}) {
			return this.printStore.applyMeshToSlice(this.viewport, options)
		},
		async _applyAfterLoad() {
			if (!this.viewport?.recenter) {
				return
			}
			this.viewport.recenter()
			this._syncTransformFromViewportImmediate()
			if (this.printStore.meshState.autoApply) {
				await this.applyToSlice({ silent: true })
			} else {
				this.printStore.markMeshDirty()
			}
		},
		_syncTransformFromViewportImmediate() {
			if (!this.viewport?.getTransform) {
				return
			}
			const transform = this.viewport.getTransform()
			if (transform) {
				this.printStore.setMeshTransform(transform)
			}
		},
		loadOptionsForFile(file) {
			if (!file?.name?.toLowerCase().endsWith('.3mf')) {
				return {}
			}
			const ids = this.printStore.threeMfSelectedIds
			return ids?.length ? { selectedIds: ids } : {}
		},
		async reloadModelPreview() {
			if (!this.file || !this.viewportReady) {
				return
			}
			await this.flushPendingLoad()
		},
		async getMeshSnapshot() {
			return this.viewport?.exportTransformedMesh?.() || null
		},
		async applyMeshSnapshot(mesh) {
			if (!mesh?.positions || !mesh?.indices) {
				return false
			}
			const meta = this.viewport?.setMeshData(mesh)
			if (meta) {
				this.printStore.setModelMeta(meta)
			}
			this._scheduleTransformSync()
			return true
		},
		async analyzeCurrentMesh() {
			const mesh = await this.getMeshSnapshot()
			if (!mesh) {
				return null
			}
			const result = analyzeMesh(mesh.positions, mesh.indices)
			this.printStore.setMeshHealth(result)
			return result
		},
		async repairCurrentMesh() {
			const mesh = await this.getMeshSnapshot()
			if (!mesh) {
				return false
			}
			const repaired = autoRepair(mesh.positions, mesh.indices)
			await this.applyMeshSnapshot(repaired)
			const result = analyzeMesh(repaired.positions, repaired.indices)
			this.printStore.setMeshHealth(result)
			const s = repaired.stats
			const parts = []
			if (s.weldedVertices) {
				parts.push(`welded ${s.weldedVertices} verts`)
			}
			if (s.filledTriangles) {
				parts.push(`filled ${s.filledTriangles} hole tris`)
			}
			if (s.splitNonManifold) {
				parts.push(`split ${s.splitNonManifold} non-manifold edge(s)`)
			}
			if (s.removedDegenerate) {
				parts.push(`removed ${s.removedDegenerate} bad tris`)
			}
			const detail = parts.length ? parts.join(', ') : 'no changes needed'
			if (result.watertight) {
				toastSuccess(`Repaired — now watertight (${detail})`)
			} else {
				// Report precisely what remains so the user knows the state.
				const remain = []
				if (result.openEdgeCount) {
					remain.push(`${result.openEdgeCount} open edge(s)`)
				}
				if (result.nonManifoldCount) {
					remain.push(`${result.nonManifoldCount} non-manifold edge(s)`)
				}
				const remainStr = remain.length ? remain.join(', ') : 'complex geometry'
				toastWarning(`Repair applied (${detail}); still not watertight — ${remainStr} remain. It may still slice, but check the result.`)
			}
			return true
		},
		async autoOrientMesh(mode = 'default') {
			const mesh = await this.getMeshSnapshot()
			if (!mesh) {
				return false
			}
			const before = this.printStore.meshHealth.analyzed
				? this.printStore.meshHealth.overhangPct
				: analyzeMesh(mesh.positions, mesh.indices).overhangPct
			const oriented = autoOrient(mesh.positions, mesh.indices, { mode })
			await this.applyMeshSnapshot({ positions: oriented.positions, indices: mesh.indices })
			const result = analyzeMesh(oriented.positions, mesh.indices)
			this.printStore.setMeshHealth(result)
			const modeLabel = { default: 'balanced', supports: 'min supports', footprint: 'min footprint' }[mode] || mode
			toastSuccess(`Auto-orient (${modeLabel}): overhang ${before}% → ${result.overhangPct}%`)
			return true
		},
		async scaleToFitMesh() {
			const mesh = await this.getMeshSnapshot()
			if (!mesh) {
				return false
			}
			const factor = scaleToFitBed(mesh.bbox, this.buildVolume)
			if (factor >= 0.999) {
				toastInfo('Model already fits the build volume')
				return false
			}
			const scaled = applyUniformScale(mesh.positions, factor)
			await this.applyMeshSnapshot({ positions: scaled, indices: mesh.indices })
			const result = analyzeMesh(scaled, mesh.indices)
			this.printStore.setMeshHealth(result)
			toastSuccess(`Scaled to ${Math.round(factor * 100)}% to fit bed`)
			return true
		},
		async scaleMaxFitMesh() {
			const mesh = await this.getMeshSnapshot()
			if (!mesh) {
				return false
			}
			const factor = scaleToMaxFitBed(mesh.bbox, this.buildVolume)
			if (Math.abs(factor - 1) < 0.001) {
				toastInfo('Model already fills the build volume')
				return false
			}
			const scaled = applyUniformScale(mesh.positions, factor)
			await this.applyMeshSnapshot({ positions: scaled, indices: mesh.indices })
			const result = analyzeMesh(scaled, mesh.indices)
			this.printStore.setMeshHealth(result)
			toastSuccess(`Scaled to ${Math.round(factor * 100)}% to fill bed`)
			return true
		},
		// Center on X/Y only, keeping the current Z (height) — uses live world
		// bounds + bed centre, then a world-delta translate.
		centerXY() {
			const bounds = this.getWorldBounds()
			if (!bounds) {
				return
			}
			const [bx, by] = this.buildVolume
			const dx = (bx / 2) - bounds.center[0]
			const dy = (by / 2) - bounds.center[1]
			this.translateBy([dx, dy, 0])
		},
		// Snap each rotation axis to the nearest 90°, so a hand-rotated part lands
		// square to the bed.
		snapRotationToAxis() {
			const t = this.viewport?.getTransform?.()
			if (!t?.rotation) {
				return
			}
			const halfPi = Math.PI / 2
			const target = t.rotation.map((r) => Math.round(r / halfPi) * halfPi)
			const delta = [
				target[0] - t.rotation[0],
				target[1] - t.rotation[1],
				target[2] - t.rotation[2],
			]
			const toDeg = (r) => (r * 180) / Math.PI
			this.applyRotationDegrees({ x: toDeg(delta[0]), y: toDeg(delta[1]), z: toDeg(delta[2]) })
		},
		setGizmoMode(mode) {
			this.viewport?.setGizmoMode?.(mode)
		},
		cameraPreset(name) {
			this.viewport?.setCameraPreset?.(name)
		},
		setWireframe(on) {
			this.viewport?.setWireframe?.(on)
		},
		setSectionClip(state) {
			this.viewport?.setSectionClip?.(state)
		},
		showCutPlane(axis, position01) {
			return this.viewport?.showCutPlane?.(axis, position01) || null
		},
		hideCutPlane() {
			this.viewport?.hideCutPlane?.()
		},
		getWorldBounds() {
			return this.viewport?.getWorldBounds?.() || null
		},
		isOnBed() {
			return this.viewport?.isOnBed?.() !== false
		},
		resetTransform() {
			this.viewport?.resetTransform?.()
			this._scheduleTransformSync()
		},
		resetRotation() {
			this.viewport?.resetRotation?.()
			this._scheduleTransformSync()
		},
		resetScale() {
			this.viewport?.resetScale?.()
			this._scheduleTransformSync()
		},
		moveTo(vec) {
			this.viewport?.setPosition?.(vec)
			this._scheduleTransformSync()
		},
		translateBy(vec) {
			this.viewport?.translateModel?.(vec)
			this._scheduleTransformSync()
		},
		dropToBed() {
			this.viewport?.dropToBed?.()
			this._scheduleTransformSync()
		},
		scaleAxis(vec) {
			this.viewport?.scaleModelAxis?.(vec)
			this._scheduleTransformSync()
		},
		scaleToSize({ axis = 'x', value = 0, lockAspect = true } = {}) {
			const bounds = this.getWorldBounds()
			if (!bounds || !(value > 0)) {
				return
			}
			const idx = axis === 'x' ? 0 : axis === 'y' ? 1 : 2
			const current = bounds.size[idx]
			if (!(current > 0)) {
				return
			}
			const factor = value / current
			if (lockAspect) {
				this.applyScalePercent(factor)
			} else {
				const vec = [1, 1, 1]
				vec[idx] = factor
				this.scaleAxis(vec)
			}
		},
		async mirrorMeshAxis(axis) {
			const mesh = await this.getMeshSnapshot()
			if (!mesh) {
				return false
			}
			const mirrored = mirrorMesh(mesh.positions, mesh.indices, axis)
			await this.applyMeshSnapshot(mirrored)
			const result = analyzeMesh(mirrored.positions, mirrored.indices)
			this.printStore.setMeshHealth(result)
			toastSuccess(`Mirrored across ${axis.toUpperCase()} axis`)
			return true
		},
		async placeOnFaceAt(clientX, clientY) {
			const normal = this.viewport?.pickFaceNormal?.(clientX, clientY)
			if (!normal) {
				toastInfo('Click directly on a model face')
				return false
			}
			const mesh = await this.getMeshSnapshot()
			if (!mesh) {
				return false
			}
			const matrix = rotationMatrixFromTo(normal, { x: 0, y: 0, z: -1 })
			const rotated = applyRotationMatrix(mesh.positions, matrix)
			await this.applyMeshSnapshot({ positions: rotated, indices: mesh.indices })
			const result = analyzeMesh(rotated, mesh.indices)
			this.printStore.setMeshHealth(result)
			toastSuccess('Selected face placed on bed')
			return true
		},
		async cutMesh({ axis = 'z', position01 = 0.5, keep = 'both', cap = true } = {}) {
			const mesh = await this.getMeshSnapshot()
			if (!mesh) {
				return false
			}
			// Single-half mode (legacy) still supported; default is keep BOTH.
			if (keep === 'top' || keep === 'bottom') {
				const result = cutMeshByPlane(mesh.positions, mesh.indices, { axis, position01, keep, cap })
				if (!result || !result.positions.length) {
					toastInfo('Cut removed the whole model — adjust the plane')
					return false
				}
				await this.applyMeshSnapshot({ positions: result.positions, indices: result.indices })
				this.printStore.setMeshHealth(analyzeMesh(result.positions, result.indices))
				toastSuccess(`Cut applied — kept ${keep} half`)
				return true
			}

			// Keep BOTH halves as independent, movable objects (Phase 3c).
			const { top, bottom } = cutMeshBothHalves(mesh.positions, mesh.indices, { axis, position01, cap })
			const halves = [bottom, top].filter((h) => h && h.positions.length)
			if (halves.length < 2) {
				toastInfo('Cut did not split the model into two parts — adjust the plane')
				return false
			}
			// Replace the source object with the two halves.
			const sourceId = this.viewport?.getSelectedId?.()
			for (const h of halves) {
				this.viewport?.addObjectFromMesh?.({ positions: h.positions, indices: h.indices })
			}
			if (sourceId) {
				this.viewport?.removeObject?.(sourceId)
			}
			this._syncSceneFromViewport()
			// Health reflects the (newly selected) half.
			const sel = await this.getMeshSnapshot()
			if (sel) {
				this.printStore.setMeshHealth(analyzeMesh(sel.positions, sel.indices))
			}
			this._scheduleTransformSync()
			toastSuccess('Cut into two parts — drag either to reposition')
			return true
		},
		// ── Drill: subtract a cylinder bored along the picked face normal. ────────
		async drillAt(clientX, clientY, { diameter = 4, depth = 0, through = true } = {}) {
			const hit = this.viewport?.pickSurfacePoint?.(clientX, clientY)
			if (!hit) {
				toastInfo('Click directly on a model face to drill')
				return false
			}
			const mesh = await this.getMeshSnapshot()
			if (!mesh) {
				return false
			}
			const bounds = this.getWorldBounds()
			const span = bounds ? Math.hypot(bounds.size[0], bounds.size[1], bounds.size[2]) : 100
			// Through-hole: a cylinder longer than the part, centred on the hit so it
			// exits both sides. Blind hole: `depth` deep from the surface inward.
			const cylLen = through ? span * 1.5 : Math.max(0.5, depth)
			const inDir = [-hit.normal[0], -hit.normal[1], -hit.normal[2]] // into the part
			// Centre the cylinder: through → at the hit point; blind → half-depth in.
			const c = through
				? hit.point
				: [
					hit.point[0] + inDir[0] * (cylLen / 2),
					hit.point[1] + inDir[1] * (cylLen / 2),
					hit.point[2] + inDir[2] * (cylLen / 2),
				]
			const cyl = makeCylinder(c, hit.normal, Math.max(0.2, diameter / 2), cylLen)
			try {
				const out = csgSubtract(mesh, cyl)
				if (!out.positions.length) {
					toastInfo('Drill removed the whole model — reduce the diameter')
					return false
				}
				await this.applyMeshSnapshot(out)
				this.printStore.setMeshHealth(analyzeMesh(out.positions, out.indices))
				toastSuccess(`Drilled a ${diameter}mm ${through ? 'through-' : ''}hole`)
				return true
			} catch (e) {
				toastError(e?.message === 'csg_too_large' ? 'Model too dense to drill (try simplifying)' : 'Drill failed', e)
				return false
			}
		},
		// ── Hollow: shell the current mesh to a wall thickness (+ optional drain). ─
		async hollowCurrent({ thickness = 2, drainDiameter = 0 } = {}) {
			const mesh = await this.getMeshSnapshot()
			if (!mesh) {
				return false
			}
			const shell = hollowMesh(mesh.positions, mesh.indices, thickness)
			if (!shell.ok) {
				toastInfo(shell.reason === 'too_thin'
					? `Model too thin to hollow at ${thickness}mm walls`
					: 'Could not hollow this model')
				return false
			}
			let out = { positions: shell.positions, indices: shell.indices }
			if (drainDiameter > 0) {
				// Drain hole bored straight up through the bottom (−Z face).
				const b = this.getWorldBounds()
				if (b) {
					const cx = b.center[0]
					const cy = b.center[1]
					const cyl = makeCylinder([cx, cy, b.min[2]], [0, 0, 1],
						Math.max(0.5, drainDiameter / 2), thickness * 4)
					try {
						out = csgSubtract(out, cyl)
					} catch { /* keep the shell without a drain if CSG bails */ }
				}
			}
			await this.applyMeshSnapshot(out)
			this.printStore.setMeshHealth(analyzeMesh(out.positions, out.indices))
			toastSuccess(`Hollowed to ${thickness}mm walls${drainDiameter > 0 ? ' + drain hole' : ''}`)
			return true
		},
		// ── Emboss / deboss text on a picked face. ───────────────────────────────
		async embossAt(clientX, clientY, { text, size = 6, depth = 1, mode = 'emboss' } = {}) {
			if (!String(text || '').trim()) {
				toastInfo('Enter text to emboss')
				return false
			}
			const hit = this.viewport?.pickSurfacePoint?.(clientX, clientY)
			if (!hit) {
				toastInfo('Click directly on a model face to place the text')
				return false
			}
			const mesh = await this.getMeshSnapshot()
			if (!mesh) {
				return false
			}
			const textMesh = makeTextMesh({ text, size, depth, point: hit.point, normal: hit.normal })
			if (!textMesh) {
				toastInfo('Could not build text geometry')
				return false
			}
			try {
				const out = mode === 'deboss'
					? csgSubtract(mesh, textMesh)
					: csgUnion(mesh, textMesh)
				await this.applyMeshSnapshot(out)
				this.printStore.setMeshHealth(analyzeMesh(out.positions, out.indices))
				toastSuccess(`${mode === 'deboss' ? 'Debossed' : 'Embossed'} "${text}"`)
				return true
			} catch (e) {
				toastError(e?.message === 'csg_too_large' ? 'Model too dense for text (try simplifying)' : 'Emboss failed', e)
				return false
			}
		},
		// ── Arrange all scene objects on the bed without overlap. ────────────────
		arrangeAll() {
			const list = this.viewport?.listObjects?.() || []
			if (list.length < 2) {
				toastInfo('Add more objects to arrange')
				return false
			}
			const items = list.map((o) => ({
				id: o.id,
				size: [o.bbox?.x || 10, o.bbox?.y || 10],
				z: 0,
			}))
			const { placements, overflow } = arrangeObjects(items, this.buildVolume)
			for (const pl of placements) {
				this.viewport?.selectObject?.(pl.id)
				this.viewport?.setPosition?.(pl.center)
			}
			this._syncSceneFromViewport?.()
			this.refreshBoundsAfterOp?.()
			if (overflow > 0) {
				toastWarning(`Arranged — ${overflow} object(s) don't fit the bed`)
			} else {
				toastSuccess('Arranged all objects on the bed')
			}
			return true
		},
		// ── Measure: pick a surface point (for point-to-point distance). ─────────
		pickMeasurePoint(clientX, clientY) {
			return this.viewport?.pickSurfacePoint?.(clientX, clientY)?.point || null
		},
		onDrop(e) {
			e.preventDefault()
			this.dragOver = false
			const file = e.dataTransfer?.files?.[0]
			if (file && this.printStore.setModel(file, 'drop')) {
				this.$emit('file', file)
			}
		},
		onDragOver(e) {
			e.preventDefault()
			this.dragOver = true
		},
		onDragLeave() {
			this.dragOver = false
		},
	},
}
</script>

<template>
	<div
		ref="wrap"
		class="nc-print-viewport-inner"
		:class="{ 'nc-print-viewport-inner--drag': dragOver }"
		@drop="onDrop"
		@dragover="onDragOver"
		@dragleave="onDragLeave">
		<canvas ref="canvas" aria-label="3D model viewport" />
		<div v-if="viewportError" class="nc-print-viewport-error" role="alert">
			{{ viewportError }}
		</div>
		<div v-if="showEmptyDrop" class="nc-print-viewport-empty">
			<div class="nc-print-viewport-empty__icon" aria-hidden="true">📐</div>
			Drop or import a model file<br>
			<small>STL · 3MF · OBJ</small>
		</div>
		<div v-if="showLoading" class="nc-print-viewport-empty">
			Loading preview…
		</div>
		<div v-if="showPreviewSkipped" class="nc-print-viewport-info">
			<strong>{{ file.name }}</strong> loaded — preview unavailable for this format.
		</div>
		<div v-if="showLoadError" class="nc-print-viewport-error nc-print-viewport-error--inline">
			Preview failed: {{ loadError }}. You can still slice on the Slice tab.
		</div>
		<div
			class="nc-print-viewport-bed-legend"
			:class="{ 'nc-print-viewport-bed-legend--warn': bedLegendWarn }"
			aria-hidden="true">
			{{ bedLegend }}
		</div>
		<div
			v-if="printStore.modelMeta.bbox && !printStore.modelMeta.fitsBed"
			class="nc-print-viewport-warn">
			Model may exceed build volume
		</div>
		<div v-if="printStore.meshState.dirty && !printStore.meshState.autoApply" class="nc-print-viewport-warn nc-print-viewport-warn--dirty">
			Transform not applied to slice mesh
			<button type="button" class="nc-print-link-btn" @click="applyToSlice">Apply to slice</button>
		</div>
		<div
			v-else-if="printStore.meshState.applying"
			class="nc-print-viewport-applied nc-print-viewport-applied--pending">
			Applying…
		</div>
		<div
			v-else-if="printStore.meshState.appliedAt && !printStore.meshState.dirty"
			class="nc-print-badge nc-print-badge--ok nc-print-viewport-applied nc-print-viewport-applied--flash">
			<span aria-hidden="true">✓</span> Applied to slice mesh
		</div>
		<div v-if="printStore.modelMeta.bbox" class="nc-print-viewport-meta">
			{{ Math.round(printStore.modelMeta.bbox.x) }}×{{ Math.round(printStore.modelMeta.bbox.y) }}×{{ Math.round(printStore.modelMeta.bbox.z) }} mm
			<span v-if="printStore.modelMeta.triangleCount"> · {{ printStore.modelMeta.triangleCount }} tris</span>
		</div>
	</div>
</template>

<style scoped>
.nc-print-viewport-inner {
	height: 100%;
	min-height: 360px;
	position: relative;
}

.nc-print-viewport-inner--drag {
	outline: 2px solid var(--nc-app-accent);
}

.nc-print-viewport-inner canvas {
	display: block;
	height: 100%;
	width: 100%;
}

.nc-print-viewport-empty {
	color: var(--nc-gcs-text-muted);
	font-size: var(--nc-gcs-text-sm);
	left: 50%;
	position: absolute;
	text-align: center;
	top: 50%;
	transform: translate(-50%, -50%);
	z-index: 1;
	pointer-events: none;
}

.nc-print-viewport-empty__icon {
	font-size: 2rem;
	margin-bottom: 4px;
}

.nc-print-viewport-info {
	background: color-mix(in srgb, var(--nc-app-accent) 18%, transparent);
	border: 1px solid color-mix(in srgb, var(--nc-app-accent) 40%, var(--nc-gcs-border));
	border-radius: var(--nc-gcs-radius-sm);
	bottom: 48px;
	color: var(--nc-gcs-text-secondary);
	font-size: var(--nc-gcs-text-sm);
	left: 8px;
	max-width: calc(100% - 16px);
	padding: 8px 10px;
	position: absolute;
	right: 8px;
	z-index: 2;
}

.nc-print-viewport-error {
	background: color-mix(in srgb, var(--nc-gcs-danger) 30%, transparent);
	border-radius: var(--nc-gcs-radius-sm);
	color: var(--nc-gcs-danger-soft);
	font-size: var(--nc-gcs-text-sm);
	left: 8px;
	padding: 8px 10px;
	position: absolute;
	right: 8px;
	top: 8px;
	z-index: 3;
}

.nc-print-viewport-error--inline {
	top: auto;
	bottom: 48px;
}

.nc-print-viewport-warn {
	background: color-mix(in srgb, var(--nc-gcs-danger) 25%, transparent);
	border-radius: var(--nc-gcs-radius-sm);
	color: var(--nc-gcs-danger-soft);
	font-size: var(--nc-gcs-text-sm);
	left: 8px;
	padding: 4px 8px;
	position: absolute;
	top: 8px;
	z-index: 2;
}

.nc-print-viewport-warn--dirty {
	background: color-mix(in srgb, var(--nc-gcs-warning, #eab308) 22%, transparent);
	color: var(--nc-gcs-text-primary);
	top: 36px;
	display: flex;
	align-items: center;
	gap: 8px;
	flex-wrap: wrap;
}

.nc-print-viewport-applied {
	background: color-mix(in srgb, var(--nc-app-accent) 22%, transparent);
	border-radius: var(--nc-gcs-radius-sm);
	color: var(--nc-app-accent);
	font-size: var(--nc-gcs-text-sm);
	font-weight: 600;
	left: 8px;
	padding: 4px 10px;
	position: absolute;
	top: 36px;
	z-index: 2;
}

.nc-print-viewport-applied--pending {
	opacity: 0.85;
}

.nc-print-viewport-applied--flash {
	animation: nc-print-applied-flash 0.9s ease-out 1;
}

@keyframes nc-print-applied-flash {
	0% {
		box-shadow: 0 0 0 0 color-mix(in srgb, var(--nc-app-accent) 65%, transparent);
		transform: scale(1.06);
	}
	100% {
		box-shadow: 0 0 0 8px transparent;
		transform: scale(1);
	}
}

.nc-print-viewport-bed-legend {
	background: rgba(0, 0, 0, 0.45);
	border-radius: var(--nc-gcs-radius-sm);
	color: #e6edf3;
	font-size: 11px;
	font-weight: 500;
	padding: 4px 8px;
	position: absolute;
	right: 8px;
	top: 8px;
	z-index: 2;
	pointer-events: none;
}

.nc-print-viewport-bed-legend--warn {
	background: color-mix(in srgb, var(--nc-gcs-warning, #eab308) 70%, #000);
	color: #1a1400;
}

.nc-print-viewport-meta {
	background: rgba(0, 0, 0, 0.45);
	border-radius: var(--nc-gcs-radius-sm);
	bottom: 8px;
	color: #e6edf3;
	font-size: 11px;
	left: 8px;
	padding: 4px 8px;
	position: absolute;
	z-index: 2;
}
</style>
