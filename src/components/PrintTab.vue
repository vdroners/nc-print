<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { pausePrint, resumePrint, cancelPrint } from '@/services/moonraker-api.js'
import { cameraStreamUrl } from '@/services/moonraker-api.js'

export default {
	name: 'PrintTab',
	data() {
		return {
			busy: false,
		}
	},
	computed: {
		...mapStores(usePrintStore),
		streamUrl() {
			return cameraStreamUrl(this.printStore.config)
		},
		isPaused() {
			return (this.printStore.printerState.state || '').toLowerCase().includes('pause')
		},
		isPrinting() {
			return (this.printStore.printerState.state || '').toLowerCase().includes('print')
		},
	},
	methods: {
		async withBusy(fn) {
			this.busy = true
			try {
				await fn()
				await this.printStore.refreshPrinterState()
			} catch (e) {
				console.warn('[nc_print] print control failed:', e?.message || e)
			} finally {
				this.busy = false
			}
		},
		onPause() {
			return this.withBusy(() => pausePrint())
		},
		onResume() {
			return this.withBusy(() => resumePrint())
		},
		onCancel() {
			return this.withBusy(() => cancelPrint())
		},
	},
}
</script>

<template>
	<div class="nc-print-print-tab">
		<div class="nc-print-card">
			<h2 class="nc-print-card__title">Print control</h2>
			<p style="font-size: var(--nc-gcs-text-sm); color: var(--nc-gcs-text-muted); margin: 0 0 12px;">
				State: <strong>{{ printStore.printerStatusLabel }}</strong>
				<span v-if="printStore.printerState.progress">
					· {{ Math.round(printStore.printerState.progress * 100) }}%
				</span>
				<span v-if="printStore.printerState.extruderTemp != null">
					· Nozzle {{ Math.round(printStore.printerState.extruderTemp) }}°C
				</span>
				<span v-if="printStore.printerState.bedTemp != null">
					· Bed {{ Math.round(printStore.printerState.bedTemp) }}°C
				</span>
			</p>

			<div v-if="isPrinting || isPaused" class="nc-print-progress">
				<div
					class="nc-print-progress__bar"
					:style="{ width: (printStore.printerState.progress * 100) + '%' }" />
			</div>

			<div class="nc-print-actions">
				<button
					type="button"
					class="nc-print-btn"
					:disabled="busy || !isPrinting || isPaused"
					@click="onPause">
					Pause
				</button>
				<button
					type="button"
					class="nc-print-btn nc-print-btn--primary"
					:disabled="busy || !isPaused"
					@click="onResume">
					Resume
				</button>
				<button
					type="button"
					class="nc-print-btn nc-print-btn--danger"
					:disabled="busy || (!isPrinting && !isPaused)"
					@click="onCancel">
					Cancel
				</button>
			</div>
		</div>

		<div class="nc-print-card">
			<h2 class="nc-print-card__title">Camera</h2>
			<div class="nc-print-camera-panel">
				<img v-if="streamUrl" :src="streamUrl" alt="Printer camera stream">
				<div v-else class="nc-print-camera-placeholder">
					No camera URL configured — set webcam URL in NC Print settings.
				</div>
			</div>
		</div>
	</div>
</template>
