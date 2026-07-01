<script>
import { mapStores } from 'pinia'
import { usePrintStore, TABS } from '@/store/print.js'
import ModelViewport from './ModelViewport.vue'
import CameraPip from './CameraPip.vue'
import ProfilePicker from './ProfilePicker.vue'
import ViewportToolbar from './ViewportToolbar.vue'
import { modelFilePickerFilter, modelFilePickerCanPick } from '@/shared/modelFileNode.js'
import { fetchModelBlob } from '@/services/files-api.js'
import { toastError } from '@/services/toast.js'

export default {
	name: 'PrepareTab',
	components: { ModelViewport, CameraPip, ProfilePicker, ViewportToolbar },
	computed: {
		...mapStores(usePrintStore),
		buildVolume() {
			return this.printStore.buildVolume
		},
	},
	methods: {
		onImportFile(file) {
			if (this.printStore.setModel(file, 'import')) {
				// viewport watches file prop
			}
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
			try {
				const dialogs = await import('@nextcloud/dialogs')
				const { getFilePickerBuilder, FilePickerClosed } = dialogs
				const builder = getFilePickerBuilder('Select STL, 3MF, or OBJ')
				builder.setMultiSelect(false)
				builder.setFilter(modelFilePickerFilter)
				builder.setCanPick(modelFilePickerCanPick)
				const picker = builder.build()
				const result = await picker.pick()
				if (!result) {
					return
				}
				let path = ''
				if (typeof result === 'string') {
					path = result
				} else if (Array.isArray(result)) {
					path = result[0]?.path || ''
				} else {
					path = result?.path || ''
				}
				if (!path) {
					return
				}
				const blob = await fetchModelBlob({ dav_path: path })
				const name = path.split('/').pop() || 'model.stl'
				this.printStore.setModel(new File([blob], name, { type: blob.type }), 'files')
			} catch (e) {
				if (e?.constructor?.name === 'FilePickerClosed') {
					return
				}
				toastError('File pick failed', e)
			}
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
		</div>

		<div class="nc-print-card">
			<h2 class="nc-print-card__title">Profiles</h2>
			<ProfilePicker v-if="printStore.profiles.loaded" />
		</div>

		<div class="nc-print-row nc-print-row--equal">
			<button type="button" class="nc-print-card nc-print-dropzone" @click="pickFromFiles">
				<strong>From Files</strong>
				<span>Pick from Nextcloud</span>
			</button>
		</div>

		<ViewportToolbar
			:can-center="printStore.hasModel"
			@import="onToolbarImport"
			@center="onCenter"
			@clear="onClear" />

		<div class="nc-print-viewport-wrap">
			<ModelViewport
				ref="viewport"
				:file="printStore.model.file"
				:build-volume="buildVolume"
				@file="onViewportFile" />
			<CameraPip :config="printStore.config" />
		</div>

		<div class="nc-print-actions">
			<button
				type="button"
				class="nc-print-btn nc-print-btn--primary"
				:disabled="!printStore.prepareComplete"
				@click="goToSlice">
				Next to Slice →
			</button>
		</div>
	</div>
</template>
