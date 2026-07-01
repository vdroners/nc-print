<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'

export default {
	name: 'MultiPrinterPicker',
	computed: {
		...mapStores(usePrintStore),
		printers() {
			return this.printStore.configuredPrinters
		},
		show() {
			return this.printers.length > 1
		},
	},
	methods: {
		onChange() {
			this.printStore.onPrinterTargetChange()
		},
	},
}
</script>

<template>
	<div v-if="show" class="nc-print-field nc-print-multi-printer">
		<label for="nc-print-target-printer">Send to printer</label>
		<select
			id="nc-print-target-printer"
			v-model="printStore.selectedPrinterId"
			@change="onChange">
			<option v-for="p in printers" :key="p.id" :value="p.id">
				{{ p.name || p.id }}
			</option>
		</select>
	</div>
</template>

<style scoped>
.nc-print-multi-printer {
	margin-bottom: var(--nc-gcs-space-sm);
}
</style>
