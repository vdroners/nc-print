<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { createViewport } from '@/three/viewport.js'
import { toastError, toastInfo, toastSuccess } from '@/services/toast.js'
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
import { cutMeshByPlane } from '@/services/mesh-cut.js'

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
			if (s.removedDegenerate) {
				parts.push(`removed ${s.removedDegenerate} bad tris`)
			}
			const detail = parts.length ? parts.join(', ') : 'no changes needed'
			if (result.watertight) {
				toastSuccess(`Repaired — now watertight (${detail})`)
			} else {
				toastSuccess(`Repair improved mesh (${detail}); ${result.openEdgeCount} open edge(s) remain`)
			}
			return true
		},
		async autoOrientMesh() {
			const mesh = await this.getMeshSnapshot()
			if (!mesh) {
				return false
			}
			const before = this.printStore.meshHealth.analyzed
				? this.printStore.meshHealth.overhangPct
				: analyzeMesh(mesh.positions, mesh.indices).overhangPct
			const oriented = autoOrient(mesh.positions, mesh.indices)
			await this.applyMeshSnapshot({ positions: oriented.positions, indices: mesh.indices })
			const result = analyzeMesh(oriented.positions, mesh.indices)
			this.printStore.setMeshHealth(result)
			toastSuccess(`Auto-orient (${oriented.label}): overhang ${before}% → ${result.overhangPct}%`)
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
		async cutMesh({ axis = 'z', position01 = 0.5, keep = 'bottom', cap = true } = {}) {
			const mesh = await this.getMeshSnapshot()
			if (!mesh) {
				return false
			}
			const result = cutMeshByPlane(mesh.positions, mesh.indices, { axis, position01, keep, cap })
			if (!result || !result.positions.length) {
				toastInfo('Cut removed the whole model — adjust the plane')
				return false
			}
			await this.applyMeshSnapshot({ positions: result.positions, indices: result.indices })
			const analysis = analyzeMesh(result.positions, result.indices)
			this.printStore.setMeshHealth(analysis)
			toastSuccess(`Cut applied — kept ${keep} half`)
			return true
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
