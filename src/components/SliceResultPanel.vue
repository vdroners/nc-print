<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { formatPrintTime } from '@/services/slicer-utils.js'

export default {
	name: 'SliceResultPanel',
	computed: {
		...mapStores(usePrintStore),
		job() {
			return this.printStore.sliceJob
		},
		show() {
			return this.job.status === 'done'
		},
		printTimeLabel() {
			return formatPrintTime(this.job.estimatedTimeS)
		},
		gcodeKb() {
			if (!this.job.gcodeSizeBytes) {
				return null
			}
			return (this.job.gcodeSizeBytes / 1024).toFixed(1)
		},
		filamentBreakdown() {
			const rows = this.job.filamentBreakdown || []
			if (!rows.length) {
				return []
			}
			if (rows.length === 1) {
				return []
			}
			return rows.map((grams, index) => ({
				tool: index + 1,
				grams: Number(grams) || 0,
			}))
		},
		filamentBreakdownTotal() {
			if (!this.filamentBreakdown.length) {
				return this.job.filamentUsedG
			}
			return this.filamentBreakdown.reduce((sum, row) => sum + row.grams, 0)
		},
	},
	methods: {
		download() {
			this.printStore.downloadGcodeLocal()
		},
	},
}
</script>

<template>
	<div v-if="show" class="nc-print-card nc-print-slice-result">
		<h2 class="nc-print-card__title">Slice result</h2>
		<dl class="nc-print-slice-result__list">
			<div v-if="job.layers > 0">
				<dt>Layers</dt>
				<dd>{{ job.layers }}</dd>
			</div>
			<div>
				<dt>Print time</dt>
				<dd>{{ printTimeLabel }}</dd>
			</div>
			<div>
				<dt>Filament</dt>
				<dd>{{ filamentBreakdownTotal.toFixed(2) }} g</dd>
			</div>
			<template v-if="filamentBreakdown.length">
				<div
					v-for="row in filamentBreakdown"
					:key="'tool-' + row.tool"
					class="nc-print-slice-result__tool-row">
					<dt>Tool {{ row.tool }}</dt>
					<dd>{{ row.grams.toFixed(2) }} g</dd>
				</div>
			</template>
			<div v-if="gcodeKb">
				<dt>G-code</dt>
				<dd>{{ gcodeKb }} KB</dd>
			</div>
			<div>
				<dt>Backend</dt>
				<dd>{{ job.backendLabel }}</dd>
			</div>
			<div v-if="job.sentTo">
				<dt>Sent to</dt>
				<dd>{{ job.sentTo }}{{ job.printing ? ' (printing)' : '' }}</dd>
			</div>
		</dl>
		<button
			v-if="job.gcodeBlob"
			type="button"
			class="nc-print-btn"
			style="width: 100%; margin-top: 8px;"
			@click="download">
			Download G-code
		</button>
	</div>
</template>

<style scoped>
.nc-print-slice-result__tool-row dt {
	padding-left: 12px;
}
</style>
