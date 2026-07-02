<script>
import { mapStores } from 'pinia'
import { usePrintStore, TABS } from '@/store/print.js'
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
import PrepareEmptyState from './PrepareEmptyState.vue'
import SliceSummaryCard from './SliceSummaryCard.vue'
import PreciseTransformPanel from './PreciseTransformPanel.vue'
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
		PrepareEmptyState,
		SliceSummaryCard,
		PreciseTransformPanel,
		NcPrintIcon,
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
	async mounted() {
		this._onRecenter = () => this.onCenter()
		this._onChecklistAction = (e) => this.onChecklistAction(e.detail?.action)
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
		},
		onRotate(axis) {
			this.$refs.viewport?.rotateModel(axis, 90)
		},
		onLayFlat() {
			void this.$refs.viewport?.layFlatMesh()
		},
		onScaleToFit() {
			void this.$refs.viewport?.scaleToFitMesh()
		},
		onAutoOrient() {
			void this.$refs.viewport?.autoOrientMesh()
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
		},
		onRotateDegrees(deg) {
			this.$refs.viewport?.applyRotationDegrees(deg)
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

			<NcPrintCollapsible
				id="prepare-transform"
				title="Transform"
				icon="bolt"
				:default-open="canTransform">
				<PreciseTransformPanel
					:disabled="!canTransform"
					@scale-percent="onScalePercent"
					@rotate-degrees="onRotateDegrees" />
			</NcPrintCollapsible>
		</template>

		<template #center>
			<PrepareEmptyState v-if="!printStore.hasModel">
				<template #actions>
					<button type="button" class="nc-print-btn nc-print-btn--primary" @click="triggerImport">
						Import model
					</button>
					<button type="button" class="nc-print-btn" @click="pickFromFiles">
						From Files
					</button>
				</template>
			</PrepareEmptyState>

			<div ref="importCluster" class="nc-print-import-cluster">
				<ViewportToolbar
					ref="toolbar"
					:can-center="printStore.hasModel"
					:can-transform="canTransform"
					@import="onToolbarImport"
					@center="onCenter"
					@rotate="onRotate"
					@lay-flat="onLayFlat"
					@scale-to-fit="onScaleToFit"
					@auto-orient="onAutoOrient"
					@apply="onApplyMesh" />
				<button type="button" class="nc-print-btn" @click="pickFromFiles">
					From Files
				</button>
			</div>

			<div class="nc-print-viewport-wrap nc-print-viewport-wrap--studio">
				<ModelViewport
					ref="viewport"
					:file="printStore.model.file"
					:build-volume="buildVolume" />
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
