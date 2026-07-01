<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { emergencyStop } from '@/services/moonraker-api.js'
import { toastError, toastSuccess } from '@/services/toast.js'
import NcPrintIcon from './NcPrintIcon.vue'

export default {
	name: 'EmergencyStopButton',
	components: { NcPrintIcon },
	data() {
		return {
			confirmOpen: false,
			busy: false,
		}
	},
	computed: {
		...mapStores(usePrintStore),
		printerId() {
			return this.printStore.selectedPrinterId || undefined
		},
		disabled() {
			return this.busy || !this.printStore.printerState.connected
		},
	},
	methods: {
		openConfirm() {
			this.confirmOpen = true
		},
		closeConfirm() {
			this.confirmOpen = false
		},
		async confirmStop() {
			this.confirmOpen = false
			this.busy = true
			try {
				await emergencyStop(this.printerId)
				await this.printStore.refreshPrinterState()
				toastSuccess('Emergency stop sent')
			} catch (e) {
				toastError('Emergency stop failed', e)
			} finally {
				this.busy = false
			}
		},
	},
}
</script>

<template>
	<div class="nc-print-estop-wrap">
		<button
			type="button"
			class="nc-print-estop"
			:disabled="disabled"
			@click="openConfirm">
			<NcPrintIcon name="bolt" :size="18" />
			E-STOP
		</button>

		<div v-if="confirmOpen" class="nc-print-estop-dialog" role="alertdialog" aria-labelledby="nc-print-estop-title">
			<div class="nc-print-estop-dialog__panel">
				<h3 id="nc-print-estop-title">Emergency stop?</h3>
				<p>This immediately halts all printer motion and heaters. Use only in an emergency.</p>
				<div class="nc-print-actions">
					<button type="button" class="nc-print-btn" @click="closeConfirm">
						Cancel
					</button>
					<button type="button" class="nc-print-btn nc-print-estop nc-print-estop--inline" @click="confirmStop">
						Confirm E-STOP
					</button>
				</div>
			</div>
		</div>
	</div>
</template>

<style scoped>
.nc-print-estop-wrap {
	margin-top: var(--nc-gcs-space-md);
}

.nc-print-estop {
	align-items: center;
	appearance: none;
	background: var(--nc-gcs-danger);
	border: 2px solid color-mix(in srgb, var(--nc-gcs-danger) 70%, #000);
	border-radius: var(--nc-gcs-radius-sm);
	color: #fff;
	cursor: pointer;
	display: inline-flex;
	font-family: inherit;
	font-size: var(--nc-gcs-text-base);
	font-weight: 700;
	gap: 8px;
	justify-content: center;
	letter-spacing: 0.08em;
	padding: 10px 18px;
	width: 100%;
}

.nc-print-estop:disabled {
	cursor: not-allowed;
	opacity: 0.5;
}

.nc-print-estop--inline {
	width: auto;
}

.nc-print-estop-dialog {
	align-items: center;
	background: rgba(0, 0, 0, 0.45);
	display: flex;
	inset: 0;
	justify-content: center;
	padding: 16px;
	position: fixed;
	z-index: 10000;
}

.nc-print-estop-dialog__panel {
	background: var(--nc-gcs-bg-surface);
	border: 1px solid var(--nc-gcs-border);
	border-radius: var(--nc-gcs-radius);
	max-width: 420px;
	padding: var(--nc-gcs-space-lg);
	width: 100%;
}

.nc-print-estop-dialog__panel h3 {
	margin: 0 0 8px;
}

.nc-print-estop-dialog__panel p {
	color: var(--nc-gcs-text-secondary);
	font-size: var(--nc-gcs-text-sm);
	margin: 0 0 16px;
}
</style>
