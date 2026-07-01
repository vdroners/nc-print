<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { toastInfo } from '@/services/toast.js'

export default {
	name: 'ViewportToolbar',
	props: {
		canCenter: { type: Boolean, default: false },
	},
	computed: {
		...mapStores(usePrintStore),
		infoLine() {
			if (!this.printStore.hasModel) {
				return 'No model loaded'
			}
			const kb = Math.round(this.printStore.model.size / 1024)
			return `${this.printStore.model.name} (${kb} KB)`
		},
	},
	methods: {
		onImportClick() {
			this.$refs.fileInput?.click()
		},
		onFileInput(e) {
			const file = e.target.files?.[0]
			if (file) {
				this.$emit('import', file)
			}
			e.target.value = ''
		},
		onCenter() {
			this.$emit('center')
		},
		onAutoOrient() {
			toastInfo('Auto-orient runs on the server during slicing — use Center on bed to adjust placement.')
		},
		onClear() {
			this.printStore.clearModel()
			this.$emit('clear')
		},
	},
}
</script>

<template>
	<div class="nc-print-viewport-toolbar">
		<button type="button" class="nc-print-btn" @click="onImportClick">
			Import STL/3MF/OBJ
		</button>
		<input
			ref="fileInput"
			type="file"
			accept=".stl,.3mf,.obj"
			hidden
			@change="onFileInput">
		<button
			type="button"
			class="nc-print-btn"
			:disabled="!canCenter"
			@click="onCenter">
			Center on bed
		</button>
		<button
			type="button"
			class="nc-print-btn"
			:disabled="!printStore.hasModel"
			@click="onAutoOrient">
			Auto-orient
		</button>
		<button
			type="button"
			class="nc-print-btn"
			:disabled="!printStore.hasModel"
			@click="onClear">
			Clear
		</button>
		<span class="nc-print-viewport-toolbar__info">{{ infoLine }}</span>
	</div>
</template>

<style scoped>
.nc-print-viewport-toolbar {
	align-items: center;
	display: flex;
	flex-wrap: wrap;
	gap: var(--nc-gcs-space-sm);
	margin-bottom: var(--nc-gcs-space-sm);
}

.nc-print-viewport-toolbar__info {
	color: var(--nc-gcs-text-muted);
	font-size: var(--nc-gcs-text-sm);
	margin-left: auto;
}
</style>
