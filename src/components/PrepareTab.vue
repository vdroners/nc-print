<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { TABS } from '@/constants/tabs.js'
import ModelViewport from './ModelViewport.vue'
import ProfilePicker from './ProfilePicker.vue'
import PrepareChecklist from './PrepareChecklist.vue'
import PrepareOverrides from './PrepareOverrides.vue'
import ViewportToolbar from './ViewportToolbar.vue'
import ViewportHistoryBox from './ViewportHistoryBox.vue'
import ViewportOrientPad from './ViewportOrientPad.vue'
import MeshHealthPanel from './MeshHealthPanel.vue'
import ThreeMfObjectPicker from './ThreeMfObjectPicker.vue'
import SceneObjectList from './SceneObjectList.vue'
import RecentModelsStrip from './RecentModelsStrip.vue'
import NcPrintCollapsible from './NcPrintCollapsible.vue'
import PrepareStudioLayout from './PrepareStudioLayout.vue'
import SliceSummaryCard from './SliceSummaryCard.vue'
import PrepareToolRail from './PrepareToolRail.vue'
import PrepareToolPanel from './PrepareToolPanel.vue'
import TargetPrinterPicker from './TargetPrinterPicker.vue'
import NcPrintIcon from './NcPrintIcon.vue'
import { pickFileFromNextcloud } from '@/composables/useNextcloudFilePicker.js'
import { resolveFile } from '@/services/files-api.js'
import { modelFilePickerFilter, modelFilePickerCanPick } from '@/shared/modelFileNode.js'

export default {
	name: 'PrepareTab',
	components: {
		ModelViewport,
		ProfilePicker,
		PrepareChecklist,
		PrepareOverrides,
		ViewportToolbar,
		ViewportHistoryBox,
		ViewportOrientPad,
		MeshHealthPanel,
		ThreeMfObjectPicker,
		SceneObjectList,
		RecentModelsStrip,
		NcPrintCollapsible,
		PrepareStudioLayout,
		SliceSummaryCard,
		PrepareToolRail,
		PrepareToolPanel,
		NcPrintIcon,
		TargetPrinterPicker,
	},
	data() {
		return {
			activeTool: '',
			worldBounds: null,
			facePickActive: false,
		}
	},
	computed: {
		...mapStores(usePrintStore),
		buildVolume() {
			return this.printStore.buildVolume
		},
		nextSliceTitle() {
			return this.printStore.firstPrepareBlocker || 'Continue to Slice'
		},
		canTransform() {
			return this.printStore.hasModel && !this.printStore.modelMeta.previewSkipped
		},
	},
	watch: {
		'printStore.model.file'() {
			this.activeTool = ''
			this.facePickActive = false
			this.worldBounds = null
			this.$refs.viewport?.setGizmoMode?.(null)
		},
		'printStore.meshState.appliedAt'() {
			this.refreshBounds()
		},
	},
	async mounted() {
		this._onRecenter = () => this.onCenter()
		this._onChecklistAction = (e) => this.onChecklistAction(e.detail?.action)
		this._onCanvasClick = (e) => this.onCanvasClick(e)
		this._onUndoRedo = (e) => (e.detail?.redo ? this.onRedo() : this.onUndo())
		window.addEventListener('nc-print-recenter', this._onRecenter)
		window.addEventListener('nc-print-checklist-action', this._onChecklistAction)
		window.addEventListener('nc-print-undo-redo', this._onUndoRedo)
	},
	beforeDestroy() {
		window.removeEventListener('nc-print-recenter', this._onRecenter)
		window.removeEventListener('nc-print-checklist-action', this._onChecklistAction)
		window.removeEventListener('nc-print-undo-redo', this._onUndoRedo)
	},
	methods: {
		onSelectObject(id) {
			// Drive the viewport; its selection handler mirrors back into the store.
			this.$refs.viewport?.selectObjectInViewport?.(id)
		},
		onDuplicateObject(id) {
			// Select the source, clone geometry in the viewport; the viewport
			// syncs the new object (with its id) back into the store.
			this.$refs.viewport?.selectObjectInViewport?.(id)
			this.$refs.viewport?.duplicateSelected?.()
			this.refreshBounds()
		},
		onDeleteObject(id) {
			// Viewport removes the mesh + syncs the store scene.
			this.$refs.viewport?.removeObject?.(id)
			this.refreshBounds()
		},
		onUndo() {
			this.printStore.undoTransform(this.$refs.viewport?.viewport)
			this.refreshBounds()
		},
		onRedo() {
			this.printStore.redoTransform(this.$refs.viewport?.viewport)
			this.refreshBounds()
		},
		onResetTransformAll() {
			this.$refs.viewport?.resetTransform?.()
			this.refreshBounds()
		},
		onCenter() {
			this.$refs.viewport?.recenter()
			this.refreshBounds()
		},
		onRotate(axis) {
			this.$refs.viewport?.rotateModel(axis, 90)
			this.refreshBounds()
		},
		async onLayFlat() {
			await this.$refs.viewport?.layFlatMesh()
			this.refreshBounds()
		},
		async onScaleToFit() {
			await this.$refs.viewport?.scaleToFitMesh()
			this.refreshBounds()
		},
		async onScaleMaxFit() {
			await this.$refs.viewport?.scaleMaxFitMesh()
			this.refreshBounds()
		},
		onCenterXY() {
			this.$refs.viewport?.centerXY?.()
			this.refreshBounds()
		},
		onSnapAxis() {
			this.$refs.viewport?.snapRotationToAxis?.()
			this.refreshBounds()
		},
		async onAutoOrient(mode = 'default') {
			await this.$refs.viewport?.autoOrientMesh(mode)
			this.refreshBounds()
		},
		onAnalyzeMesh() {
			void this.$refs.viewport?.analyzeCurrentMesh()
		},
		onRepairMesh() {
			void this.$refs.viewport?.repairCurrentMesh()
		},
		onApplyMesh() {
			void this.$refs.viewport?.applyToSlice()
		},
		onScalePercent(factor) {
			this.$refs.viewport?.applyScalePercent(factor)
			this.refreshBounds()
		},
		onRotateDegrees(deg) {
			this.$refs.viewport?.applyRotationDegrees(deg)
			this.refreshBounds()
		},
		refreshBounds() {
			this.$nextTick(() => {
				this.worldBounds = this.$refs.viewport?.getWorldBounds?.() || null
			})
		},
		onToolChange(id) {
			this.activeTool = id || ''
			this.applyToolMode()
		},
		applyToolMode() {
			const gizmoMap = { move: 'translate', rotate: 'rotate', scale: 'scale' }
			this.$refs.viewport?.setGizmoMode?.(gizmoMap[this.activeTool] || null)
			if (this.activeTool !== 'face' && this.facePickActive) {
				this.setFacePick(false)
			}
			if (this.activeTool === 'cut') {
				this.refreshBounds()
				this.$refs.viewport?.showCutPlane?.('z', 0.5)
			} else {
				this.$refs.viewport?.hideCutPlane?.()
			}
			this.refreshBounds()
		},
		onMoveDelta({ dx, dy, dz }) {
			this.$refs.viewport?.translateBy?.([dx, dy, dz])
			this.refreshBounds()
		},
		onDropToBed() {
			this.$refs.viewport?.dropToBed?.()
			this.refreshBounds()
		},
		onResetRotation() {
			this.$refs.viewport?.resetRotation?.()
			this.refreshBounds()
		},
		onResetScale() {
			this.$refs.viewport?.resetScale?.()
			this.refreshBounds()
		},
		onScaleAxis(vec) {
			this.$refs.viewport?.scaleAxis?.(vec)
			this.refreshBounds()
		},
		onScaleToSize(payload) {
			this.$refs.viewport?.scaleToSize?.(payload)
			this.refreshBounds()
		},
		async onMirror(axis) {
			await this.$refs.viewport?.mirrorMeshAxis?.(axis)
			this.refreshBounds()
		},
		onCutPreview({ axis, position01 }) {
			this.$refs.viewport?.showCutPlane?.(axis, position01)
		},
		async onCutApply(payload) {
			const ok = await this.$refs.viewport?.cutMesh?.(payload)
			if (ok) {
				this.$refs.viewport?.hideCutPlane?.()
				this.activeTool = ''
			}
			this.refreshBounds()
		},
		onCamera(name) {
			this.$refs.viewport?.cameraPreset?.(name)
		},
		onWireframe(on) {
			this.$refs.viewport?.setWireframe?.(on)
		},
		onSection(state) {
			this.$refs.viewport?.setSectionClip?.(state)
		},
		onFacePickToggle(on) {
			this.setFacePick(on)
		},
		setFacePick(on) {
			this.facePickActive = !!on
			this.printStore.facePickMode = !!on
			const el = this.$refs.viewportWrap
			if (!el) {
				return
			}
			if (on) {
				el.addEventListener('click', this._onCanvasClick)
			} else {
				el.removeEventListener('click', this._onCanvasClick)
			}
		},
		async onCanvasClick(e) {
			if (!this.facePickActive || e.target?.tagName !== 'CANVAS') {
				return
			}
			await this.$refs.viewport?.placeOnFaceAt?.(e.clientX, e.clientY)
			this.refreshBounds()
		},
		onCloseTool() {
			this.activeTool = ''
			this.applyToolMode()
		},
		async on3mfSelectionChange() {
			await this.$refs.viewport?.reloadModelPreview()
		},
		onRecentSelect(entry) {
			void this.printStore.loadRecentModel(entry)
		},
		async pickFromFiles() {
			const picked = await pickFileFromNextcloud({
				title: 'Select STL, 3MF, or OBJ',
				filter: modelFilePickerFilter,
				canPick: modelFilePickerCanPick,
			})
			if (!picked?.file) {
				return
			}
			try {
				const meta = await resolveFile({ dav_path: picked.davPath })
				this.printStore.setModel(picked.file, 'files', {
					file_id: meta?.file_id,
					dav_path: meta?.dav_path ?? picked.davPath,
				})
			} catch {
				this.printStore.setModel(picked.file, 'files', { dav_path: picked.davPath })
			}
		},
		async reloadProfiles() {
			await this.printStore.loadProfiles()
		},
		goToSlice() {
			this.printStore.setActiveTab(TABS.SLICE)
		},
		triggerImport() {
			this.$refs.importInput?.click()
		},
		onImportFile(e) {
			const file = e.target.files?.[0]
			if (file) {
				this.printStore.setModel(file, 'import')
			}
			e.target.value = ''
		},
		onClearModel() {
			this.printStore.clearModel()
			this.activeTool = ''
		},
		onChecklistAction(action) {
			const scrollTo = (refName) => {
				const el = this.$refs[refName]
				const node = el?.$el || el
				node?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
			}
			if (action === 'model') {
				this.$refs.importCollapsible?.expand?.()
				scrollTo('importCollapsible')
				this.triggerImport()
				return
			}
			if (action === 'mesh') {
				if (this.printStore.meshState.autoApply) {
					void this.$refs.viewport?.applyToSlice()
				} else {
					this.onApplyMesh()
				}
				return
			}
			if (action === 'watertight') {
				scrollTo('meshHealth')
				return
			}
			if (action === 'printer' || action === 'filament' || action === 'process') {
				this.$refs.modelProfilesCollapsible?.expand?.()
				scrollTo('profilePicker')
				this.$refs.profilePicker?.focusField?.(action)
				return
			}
			if (action === 'target') {
				this.$refs.targetPrinterCard?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
				document.getElementById('nc-print-target-printer-prepare')?.focus()
				return
			}
			if (action === 'slicer') {
				void this.reloadProfiles()
			}
		},
	},
}
</script>

<template>
	<PrepareStudioLayout class="nc-print-prepare nc-print-prepare--immersive" mode="immersive">
		<template #left>
		<div
			v-if="printStore.configLoadError"
			class="nc-print-banner nc-print-banner--warn"
			role="alert">
			<p class="nc-print-banner__body">
				Config API failed: {{ printStore.configLoadError }}
			</p>
		</div>

		<NcPrintCollapsible id="prepare-import" ref="importCollapsible" title="Import model" icon="layers">
			<input
				ref="importInput"
				type="file"
				accept=".stl,.3mf,.obj"
				hidden
				aria-label="Import model file"
				@change="onImportFile">
			<div class="nc-print-import-section">
				<button type="button" class="nc-print-btn nc-print-btn--primary" @click="triggerImport">
					Import STL/3MF/OBJ
				</button>
				<button type="button" class="nc-print-btn" @click="pickFromFiles">
					From Files
				</button>
				<button
					v-if="printStore.hasModel"
					type="button"
					class="nc-print-btn"
					@click="onClearModel">
					Clear
				</button>
			</div>
		</NcPrintCollapsible>

		<div
			v-if="printStore.profiles.error || (printStore.profiles.loaded && !printStore.profiles.printers.length)"
			class="nc-print-banner nc-print-banner--warn"
			role="alert">
			<p class="nc-print-banner__body" style="margin-bottom: 8px;">
				{{ printStore.profiles.error || 'No slicer profiles loaded — check the slicer service and Admin settings.' }}
			</p>
				<button type="button" class="nc-print-link-btn" style="margin-left: 8px;" @click="reloadProfiles">
					Retry
			</button>
		</div>

		<div ref="targetPrinterCard" class="nc-print-card">
			<h2 class="nc-print-card__title">
				<span class="nc-print-card__title-row">
					<NcPrintIcon name="printer" :size="18" />
					Target printer
				</span>
			</h2>
			<TargetPrinterPicker variant="prepare" select-id="nc-print-target-printer-prepare" />
		</div>

		<NcPrintCollapsible id="prepare-model-profiles" ref="modelProfilesCollapsible" title="Model & profiles" icon="layers">
				<RecentModelsStrip @select="onRecentSelect" />

				<div class="nc-print-card">
					<h2 class="nc-print-card__title">
						<span class="nc-print-card__title-row">
							<NcPrintIcon name="layers" :size="18" />
							Profiles
						</span>
					</h2>
					<p v-if="!printStore.profiles.loaded" class="nc-print-skeleton">
						Loading profiles from slicer service…
					</p>
					<ProfilePicker v-else ref="profilePicker" />
				</div>

				<ThreeMfObjectPicker @selection-change="on3mfSelectionChange" />

				<SceneObjectList
					@select="onSelectObject"
					@duplicate="onDuplicateObject"
					@delete="onDeleteObject" />
			</NcPrintCollapsible>

			<NcPrintCollapsible id="prepare-mesh-health" title="Mesh & health" icon="cube">
				<PrepareOverrides v-if="printStore.profiles.loaded" />

				<div ref="meshHealth">
					<MeshHealthPanel
						:disabled="!canTransform"
						@analyze="onAnalyzeMesh"
						@repair="onRepairMesh"
						@auto-orient="onAutoOrient" />
				</div>
			</NcPrintCollapsible>
		</template>

		<template #center>
			<div ref="viewportWrap" class="nc-print-viewport-wrap nc-print-viewport-wrap--studio">
				<ModelViewport
					ref="viewport"
					:file="printStore.model.file"
					:build-volume="buildVolume" />

				<!-- Docked info + apply chip (top-left, inboard of the side card). -->
				<div v-if="printStore.hasModel" class="nc-print-viewport-chip">
					<ViewportToolbar ref="toolbar" @apply="onApplyMesh" />
				</div>

				<!-- History box (top-right): undo / redo / reset. -->
				<ViewportHistoryBox
					v-if="printStore.hasModel"
					class="nc-print-viewport-history"
					@undo="onUndo"
					@redo="onRedo"
					@reset-transform="onResetTransformAll" />

				<!-- Orient keypad (bottom-right): center / rotate / lay flat / scale. -->
				<ViewportOrientPad
					v-if="printStore.hasModel"
					class="nc-print-viewport-orientpad"
					:disabled="!canTransform"
					:can-center="printStore.hasModel"
					@center="onCenter"
					@rotate="onRotate"
					@lay-flat="onLayFlat"
					@scale-to-fit="onScaleToFit" />

				<PrepareToolRail
					v-if="canTransform"
					:active-tool="activeTool"
					:disabled="!canTransform"
					@tool-change="onToolChange" />
				<PrepareToolPanel
					v-if="canTransform && activeTool"
					:tool="activeTool"
					:bounds="worldBounds"
					:disabled="!canTransform"
					:face-pick-active="facePickActive"
					@close="onCloseTool"
					@move-delta="onMoveDelta"
					@drop-to-bed="onDropToBed"
					@center="onCenter"
					@center-xy="onCenterXY"
					@rotate-degrees="onRotateDegrees"
					@snap-axis="onSnapAxis"
					@lay-flat="onLayFlat"
					@auto-orient="onAutoOrient"
					@reset-rotation="onResetRotation"
					@scale-uniform="onScalePercent"
					@scale-axis="onScaleAxis"
					@scale-to-size="onScaleToSize"
					@scale-to-fit="onScaleToFit"
					@scale-max-fit="onScaleMaxFit"
					@reset-scale="onResetScale"
					@face-pick-toggle="onFacePickToggle"
					@mirror="onMirror"
					@cut-preview="onCutPreview"
					@cut-apply="onCutApply"
					@camera="onCamera"
					@wireframe="onWireframe"
					@section="onSection" />
			</div>
		</template>

		<template #right>
			<PrepareChecklist @action="onChecklistAction" />

			<SliceSummaryCard />

			<div class="nc-print-prepare-footer">
				<button
					type="button"
					class="nc-print-btn nc-print-btn--primary"
					:disabled="!printStore.prepareComplete"
					:title="nextSliceTitle"
					@click="goToSlice">
					Next to Slice →
				</button>
			</div>
		</template>
	</PrepareStudioLayout>
</template>

<style scoped>
.nc-print-skeleton {
	color: var(--nc-gcs-text-muted);
	font-size: var(--nc-gcs-text-sm);
	margin: 0;
}

.nc-print-import-section {
	display: flex;
	flex-wrap: wrap;
	gap: var(--nc-gcs-space-sm);
}

.nc-print-import-section .nc-print-btn {
	flex: 1 1 auto;
}

/* ── Docked viewport controls (v1.54.0) ──────────────────────────────────────
   In studio (column) mode they sit statically above the viewport; immersive
   absolutely-positions them into the viewport corners (min-width:1201px below). */
.nc-print-viewport-chip,
.nc-print-viewport-history,
.nc-print-viewport-orientpad {
	margin-bottom: var(--nc-gcs-space-sm);
}

.nc-print-viewport-chip {
	display: inline-flex;
	align-items: center;
	gap: var(--nc-gcs-space-sm);
	padding: 4px 10px;
	border-radius: var(--nc-gcs-radius-md, 12px);
	background: color-mix(in srgb, var(--nc-gcs-bg-surface, var(--color-main-background)) 82%, transparent);
	border: 1px solid var(--nc-gcs-border);
}

.nc-print-viewport-wrap--studio {
	min-height: clamp(360px, 52vh, 640px);
	position: relative;
}

.nc-print-viewport-wrap--studio :deep(.nc-print-viewport-inner) {
	height: clamp(360px, 52vh, 640px);
	min-height: clamp(360px, 52vh, 640px);
}

/* ── Immersive: the center column IS the viewport; fill it and float the
   toolbar/rail/panel over it. Only applies on wide screens (the studio layout
   reverts to columns < 1200px, where these overrides must NOT apply). ──────── */
@media (min-width: 1201px) {
	/* Info/apply chip — top-center, inboard of the 300px side cards. */
	.nc-print-prepare--immersive .nc-print-viewport-chip {
		position: absolute;
		top: 8px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 6;
		margin: 0;
		max-width: min(560px, calc(100% - 680px));
		backdrop-filter: blur(8px);
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
	}

	/* History box — top-right corner, inboard of the right 300px card. */
	.nc-print-prepare--immersive .nc-print-viewport-history {
		position: absolute;
		top: 8px;
		right: 316px;
		z-index: 6;
		margin: 0;
	}

	/* Orient keypad — bottom-right corner, inboard of the right 300px card. */
	.nc-print-prepare--immersive .nc-print-viewport-orientpad {
		position: absolute;
		bottom: 8px;
		right: 316px;
		z-index: 6;
		margin: 0;
	}

	.nc-print-prepare--immersive .nc-print-viewport-wrap--studio {
		height: 100%;
		min-height: 0;
	}

	.nc-print-prepare--immersive .nc-print-viewport-wrap--studio :deep(.nc-print-viewport-inner) {
		height: 100%;
		min-height: 0;
	}

	/* Keep the floating tool rail / panel inboard of the 300px side overlays. */
	.nc-print-prepare--immersive .nc-print-viewport-wrap--studio :deep(.nc-print-tool-rail) {
		left: 316px;
	}

	.nc-print-prepare--immersive .nc-print-viewport-wrap--studio :deep(.nc-print-tool-panel) {
		right: 316px;
	}
}

.nc-print-prepare-footer {
	margin-top: auto;
	padding-top: var(--nc-gcs-space-md);
}

.nc-print-link-btn {
	appearance: none;
	background: none;
	border: none;
	color: var(--nc-app-accent);
	cursor: pointer;
	font: inherit;
	text-decoration: underline;
}
</style>
