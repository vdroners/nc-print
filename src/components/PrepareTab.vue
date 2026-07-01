<script>
import { mapStores } from 'pinia'
import { usePrintStore, TABS } from '@/store/print.js'
import ModelViewport from './ModelViewport.vue'
import CameraPip from './CameraPip.vue'
import ProfilePicker from './ProfilePicker.vue'
import PrepareChecklist from './PrepareChecklist.vue'
import ViewportToolbar from './ViewportToolbar.vue'
import { pickFileFromNextcloud } from '@/composables/useNextcloudFilePicker.js'
import { modelFilePickerFilter, modelFilePickerCanPick } from '@/shared/modelFileNode.js'

export default {
	name: 'PrepareTab',
	components: { ModelViewport, CameraPip, ProfilePicker, PrepareChecklist, ViewportToolbar },
	computed: {
		...mapStores(usePrintStore),
		buildVolume() {
			return this.printStore.buildVolume
		},
		nextSliceTitle() {
			return this.printStore.firstPrepareBlocker || 'Continue to Slice'
		},
	},
	methods: {
		onImportFile(file) {
			this.printStore.setModel(file, 'import')
		},
		onToolbarImport(file) {
			this.onImportFile(file)
		},
		onViewportFile() {
			// model already set via drop handler
		},
		onCenter() {
			this.$refs.viewport?.recenter()
		},
		onClear() {
			// store cleared in toolbar
		},
		async pickFromFiles() {
			const file = await pickFileFromNextcloud({
				title: 'Select STL, 3MF, or OBJ',
				filter: modelFilePickerFilter,
				canPick: modelFilePickerCanPick,
			})
			if (file) {
				this.printStore.setModel(file, 'files')
			}
		},
		async reloadProfiles() {
			await this.printStore.loadProfiles()
		},
		goToSlice() {
			this.printStore.setActiveTab(TABS.SLICE)
		},
	},
}
</script>

<template>
	<div class="nc-print-prepare">
		<div
			v-if="printStore.profiles.error || (printStore.profiles.loaded && !printStore.profiles.printers.length)"
			class="nc-print-health-banner nc-print-health-banner--warn"
			role="alert">
			No slicer profiles loaded — check forge-slicer service and Admin settings.
			<button type="button" class="nc-print-link-btn" style="margin-left: 8px;" @click="reloadProfiles">
				Retry
			</button>
		</div>

		<PrepareChecklist />

		<div class="nc-print-card">
			<h2 class="nc-print-card__title">Profiles</h2>
			<p v-if="!printStore.profiles.loaded" class="nc-print-skeleton">
				Loading profiles from forge-slicer…
			</p>
			<ProfilePicker v-else />
		</div>

		<div class="nc-print-import-cluster">
			<ViewportToolbar
				:can-center="printStore.hasModel"
				@import="onToolbarImport"
				@center="onCenter"
				@clear="onClear" />
			<button type="button" class="nc-print-btn" @click="pickFromFiles">
				From Files
			</button>
		</div>

		<div class="nc-print-viewport-wrap">
			<ModelViewport
				ref="viewport"
				:file="printStore.model.file"
				:build-volume="buildVolume"
				@file="onViewportFile" />
			<CameraPip v-if="printStore.activeTab === 'prepare'" :config="printStore.config" />
		</div>

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
	</div>
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

.nc-print-prepare-footer {
	background: color-mix(in srgb, var(--nc-gcs-bg-app) 92%, transparent);
	border-top: 1px solid var(--nc-gcs-border);
	bottom: 0;
	margin-top: auto;
	padding: var(--nc-gcs-space-md) 0 var(--nc-gcs-space-sm);
	position: sticky;
	z-index: 2;
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
