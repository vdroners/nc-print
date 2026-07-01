<script>
import { mapStores } from 'pinia'
import { usePrintStore, TABS } from '@/store/print.js'

export default {
	name: 'JobSummaryStrip',
	computed: {
		...mapStores(usePrintStore),
		modelLabel() {
			return this.printStore.model.name || 'No model'
		},
		profileLabel() {
			const n = this.printStore.selectedProfileNames
			return `${n.printer} · ${n.filament} · ${n.process}`
		},
		sliceLabel() {
			const j = this.printStore.sliceJob
			if (j.status === 'running') {
				return `Slicing ${j.pct}%`
			}
			if (j.status === 'done') {
				return 'Slice complete'
			}
			if (j.status === 'error') {
				return j.error ? `Slice failed: ${j.error}` : 'Slice failed'
			}
			return 'Not sliced'
		},
		printLabel() {
			if (this.printStore.printerState.filename) {
				return this.printStore.printerState.filename
			}
			return this.printStore.printerStatusLabel
		},
	},
	methods: {
		goPrepare() {
			this.printStore.setActiveTab(TABS.PREPARE)
		},
		goSlice() {
			this.printStore.setActiveTab(TABS.SLICE)
		},
		goPrint() {
			this.printStore.setActiveTab(TABS.PRINT)
		},
	},
}
</script>

<template>
	<div class="nc-print-job-strip" aria-label="Job summary">
		<button type="button" class="nc-print-job-strip__seg" @click="goPrepare">
			{{ modelLabel }}
		</button>
		<span class="nc-print-job-strip__dot" aria-hidden="true">·</span>
		<span class="nc-print-job-strip__seg nc-print-job-strip__seg--static" :title="profileLabel">
			{{ profileLabel }}
		</span>
		<span class="nc-print-job-strip__dot" aria-hidden="true">·</span>
		<button type="button" class="nc-print-job-strip__seg" @click="goSlice">
			{{ sliceLabel }}
		</button>
		<span class="nc-print-job-strip__dot" aria-hidden="true">·</span>
		<button type="button" class="nc-print-job-strip__seg" @click="goPrint">
			{{ printLabel }}
		</button>
	</div>
</template>

<style scoped>
.nc-print-job-strip__seg--static {
	cursor: default;
	opacity: 0.95;
}
</style>
