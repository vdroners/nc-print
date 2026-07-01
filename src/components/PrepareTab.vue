<script>
import { getFilePickerBuilder } from '@nextcloud/dialogs'
import { generateUrl } from '@nextcloud/router'
import { mapStores } from 'pinia'
import { usePrintStore, TABS } from '@/store/print.js'
import ModelViewport from './ModelViewport.vue'
import CameraPip from './CameraPip.vue'

export default {
	name: 'PrepareTab',
	components: { ModelViewport, CameraPip },
	data() {
		return {
			dragOver: false,
		}
	},
	computed: {
		...mapStores(usePrintStore),
	},
	methods: {
		onFileInput(e) {
			const file = e.target.files?.[0]
			if (file) {
				this.printStore.setModel(file, 'import')
			}
		},
		async pickFromFiles() {
			const picker = getFilePickerBuilder('Select STL or 3MF')
				.setMultiSelect(false)
				.addMimeTypeFilter('model/stl')
				.addMimeTypeFilter('application/sla')
				.addMimeTypeFilter('model/3mf')
				.allowDirectories(false)
				.build()
			const paths = await picker.pick()
			const path = Array.isArray(paths) ? paths[0] : paths
			if (!path) {
				return
			}
			try {
				const res = await fetch(generateUrl(`/apps/files/ajax/download.php?files=${encodeURIComponent(path)}`), {
					credentials: 'same-origin',
				})
				if (!res.ok) {
					throw new Error('Download failed')
				}
				const blob = await res.blob()
				const name = path.split('/').pop() || 'model.stl'
				this.printStore.setModel(new File([blob], name, { type: blob.type }), 'files')
			} catch (e) {
				console.warn('[nc_print] file pick failed:', e?.message || e)
			}
		},
		onDrop(e) {
			e.preventDefault()
			this.dragOver = false
			const file = e.dataTransfer?.files?.[0]
			if (file) {
				this.printStore.setModel(file, 'drop')
			}
		},
		onDragOver(e) {
			e.preventDefault()
			this.dragOver = true
		},
		onDragLeave() {
			this.dragOver = false
		},
		goToSlice() {
			this.printStore.setActiveTab(TABS.SLICE)
		},
	},
}
</script>

<template>
	<div class="nc-print-prepare">
		<div class="nc-print-row nc-print-row--equal">
			<label class="nc-print-card nc-print-dropzone">
				<input
					type="file"
					accept=".stl,.3mf,.obj"
					hidden
					@change="onFileInput">
				<strong>Import</strong>
				<span>Browse local STL / 3MF</span>
			</label>
			<button type="button" class="nc-print-card nc-print-dropzone" @click="pickFromFiles">
				<strong>From Files</strong>
				<span>Pick from Nextcloud</span>
			</button>
			<div
				class="nc-print-card nc-print-dropzone"
				:class="{ 'nc-print-dropzone--active': dragOver }"
				@drop="onDrop"
				@dragover="onDragOver"
				@dragleave="onDragLeave">
				<strong>Drag &amp; drop</strong>
				<span>Drop a model file here</span>
			</div>
		</div>

		<div v-if="printStore.hasModel" class="nc-print-card">
			<p class="nc-print-card__title">
				{{ printStore.model.name }}
				<span style="color: var(--nc-gcs-text-muted); font-weight: 400;">
					({{ Math.round(printStore.model.size / 1024) }} KB)
				</span>
			</p>
		</div>

		<div class="nc-print-viewport-wrap">
			<ModelViewport :model-name="printStore.model.name" />
			<CameraPip :config="printStore.config" />
		</div>

		<div class="nc-print-actions">
			<button
				type="button"
				class="nc-print-btn nc-print-btn--primary"
				:disabled="!printStore.hasModel"
				@click="goToSlice">
				Next to Slice →
			</button>
		</div>
	</div>
</template>
