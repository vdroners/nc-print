<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { TABS } from '@/constants/tabs.js'
import ModelViewport from './ModelViewport.vue'
import ProfilePicker from './ProfilePicker.vue'
import PrepareChecklist from './PrepareChecklist.vue'
import PrepareOverrides from './PrepareOverrides.vue'
import ViewportToolbar from './ViewportToolbar.vue'
import MeshHealthPanel from './MeshHealthPanel.vue'
import ThreeMfObjectPicker from './ThreeMfObjectPicker.vue'
import RecentModelsStrip from './RecentModelsStrip.vue'
import NcPrintCollapsible from './NcPrintCollapsible.vue'
import PrepareStudioLayout from './PrepareStudioLayout.vue'
import SliceSummaryCard from './SliceSummaryCard.vue'
import PrepareToolRail from './PrepareToolRail.vue'
import PrepareToolPanel from './PrepareToolPanel.vue'
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
		MeshHealthPanel,
		ThreeMfObjectPicker,
		RecentModelsStrip,
		NcPrintCollapsible,
		PrepareStudioLayout,
		SliceSummaryCard,
		PrepareToolRail,
		PrepareToolPanel,
		NcPrintIcon,
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
		window.addEventListener('nc-print-recenter', this._onRecenter)
		window.addEventListener('nc-print-checklist-action', this._onChecklistAction)
	},
	beforeDestroy() {
		window.removeEventListener('nc-print-recenter', this._onRecenter)
		window.removeEventListener('nc-print-checklist-action', this._onChecklistAction)
	},
	methods: {
		onToolbarImport(file) {
			this.printStore.setModel(file, 'import')
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
		async onAutoOrient() {
			await this.$refs.viewport?.autoOrientMesh()
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
			this.$refs.toolbar?.onImportClick?.()
		},
		onChecklistAction(action) {
			const scrollTo = (refName) => {
				const el = this.$refs[refName]
				const node = el?.$el || el
				node?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
			}
			if (action === 'model') {
				scrollTo('importCluster')
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
				scrollTo('profilePicker')
				this.$refs.profilePicker?.focusField?.(action)
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
	<PrepareStudioLayout class="nc-print-prepare">
		<template #left>
			<div
				v-if="printStore.profiles.error || (printStore.profiles.loaded && !printStore.profiles.printers.length)"
				class="nc-print-banner nc-print-banner--warn"
				role="alert">
				<p class="nc-print-banner__body" style="margin-bottom: 8px;">
					No slicer profiles loaded — check forge-slicer service and Admin settings.
				</p>
				<button type="button" class="nc-print-link-btn" style="margin-left: 8px;" @click="reloadProfiles">
					Retry
				</button>
			</div>

			<NcPrintCollapsible id="prepare-model-profiles" title="Model & profiles" icon="layers">
				<RecentModelsStrip @select="onRecentSelect" />

				<div class="nc-print-card">
					<h2 class="nc-print-card__title">
						<span class="nc-print-card__title-row">
							<NcPrintIcon name="layers" :size="18" />
							Profiles
						</span>
					</h2>
					<p v-if="!printStore.profiles.loaded" class="nc-print-skeleton">
						Loading profiles from forge-slicer…
					</p>
					<ProfilePicker v-else ref="profilePicker" />
				</div>

				<ThreeMfObjectPicker @selection-change="on3mfSelectionChange" />
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
			<div ref="importCluster" class="nc-print-import-cluster">
				<ViewportToolbar
					ref="toolbar"
					:can-center="printStore.hasModel"
					:can-transform="canTransform"
					@import="onToolbarImport"
					@pick-files="pickFromFiles"
					@center="onCenter"
					@rotate="onRotate"
					@lay-flat="onLayFlat"
					@scale-to-fit="onScaleToFit"
					@auto-orient="onAutoOrient"
					@apply="onApplyMesh" />
			</div>

			<div ref="viewportWrap" class="nc-print-viewport-wrap nc-print-viewport-wrap--studio">
				<ModelViewport
					ref="viewport"
					:file="printStore.model.file"
					:build-volume="buildVolume" />
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
					@rotate-degrees="onRotateDegrees"
					@lay-flat="onLayFlat"
					@auto-orient="onAutoOrient"
					@reset-rotation="onResetRotation"
					@scale-uniform="onScalePercent"
					@scale-axis="onScaleAxis"
					@scale-to-size="onScaleToSize"
					@scale-to-fit="onScaleToFit"
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

.nc-print-import-cluster {
	align-items: center;
	display: flex;
	flex-wrap: wrap;
	gap: var(--nc-gcs-space-sm);
	margin-bottom: var(--nc-gcs-space-sm);
}

.nc-print-import-cluster :deep(.nc-print-viewport-toolbar) {
	flex: 1 1 auto;
	margin-bottom: 0;
}

.nc-print-viewport-wrap--studio {
	min-height: clamp(360px, 52vh, 640px);
	position: relative;
}

.nc-print-viewport-wrap--studio :deep(.nc-print-viewport-inner) {
	height: clamp(360px, 52vh, 640px);
	min-height: clamp(360px, 52vh, 640px);
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
