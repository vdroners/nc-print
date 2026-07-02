<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { formatPrintTime } from '@/services/slicer-utils.js'

export default {
	name: 'PrintCompletionBanner',
	computed: {
		...mapStores(usePrintStore),
		show() {
			return this.printStore.printerState.connected
				&& this.printStore.printerControls.isComplete
		},
		durationLabel() {
			const d = this.printStore.printerState.printDuration
			if (d == null) {
				return null
			}
			return formatPrintTime(d)
		},
		estimateLabel() {
			const row = this.printStore.estimateVsActual
			if (!row?.estimatedS) {
				return null
			}
			return formatPrintTime(row.estimatedS)
		},
		// WS4: filament usage from the slice that produced this job (session only).
		filamentLabel() {
			const s = this.printStore.lastCompletedSliceStats
			if (!s || !s.filamentUsedG) {
				return null
			}
			const total = `${Math.round(s.filamentUsedG)} g`
			if (s.supportFilamentG != null && s.supportFilamentG > 0) {
				return `${total} (incl. ${Math.round(s.supportFilamentG)} g support)`
			}
			return total
		},
	},
	methods: {
		onPrintAgain() {
			const blob = this.printStore.sliceJob.gcodeBlob
			const filename = this.printStore.sliceJob.gcodeFilename
				|| this.printStore.printerState.filename
				|| 'job.gcode'
			if (blob) {
				this.printStore.pendingPrintUpload = { blob, filename }
				return
			}
			if (this.printStore.printerState.filename) {
				this.$emit('upload-last')
			}
		},
	},
}
</script>

<template>
	<div v-if="show" class="nc-print-card nc-print-complete-banner" role="status">
		<h2 class="nc-print-card__title">Print complete</h2>
		<p v-if="printStore.printerState.filename" style="margin: 0 0 8px; font-size: var(--nc-gcs-text-sm);">
			<strong>{{ printStore.printerState.filename }}</strong>
		</p>
		<p style="margin: 0 0 8px; font-size: var(--nc-gcs-text-sm); color: var(--nc-gcs-text-secondary);">
			<span v-if="durationLabel">Duration: {{ durationLabel }}</span>
			<span v-if="estimateLabel"> · Estimated: {{ estimateLabel }}</span>
			<span v-if="printStore.printerState.progress > 0">
				· {{ Math.round(printStore.printerState.progress * 100) }}%
			</span>
		</p>
		<p v-if="filamentLabel" style="margin: 0 0 8px; font-size: var(--nc-gcs-text-sm); color: var(--nc-gcs-text-secondary);">
			Filament: {{ filamentLabel }}
		</p>
		<div class="nc-print-actions">
			<button type="button" class="nc-print-btn nc-print-btn--primary" @click="onPrintAgain">
				Print again
			</button>
		</div>
	</div>
</template>

<style scoped>
.nc-print-complete-banner {
	background: color-mix(in srgb, var(--nc-app-accent) 12%, var(--nc-gcs-bg-surface));
	border-color: color-mix(in srgb, var(--nc-app-accent) 35%, var(--nc-gcs-border));
}
</style>
