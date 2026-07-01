<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { setSpeedFactor, setFlowFactor, setFanSpeed, babystepZ } from '@/services/moonraker-api.js'
import { toastError } from '@/services/toast.js'
import NcPrintIcon from './NcPrintIcon.vue'

export default {
	name: 'InPrintTuningPanel',
	components: { NcPrintIcon },
	data() {
		return {
			speed: 100,
			flow: 100,
			fan: 0,
			babystep: 0,
			busy: false,
		}
	},
	computed: {
		...mapStores(usePrintStore),
		printerId() {
			return this.printStore.selectedPrinterId || undefined
		},
		show() {
			return this.printStore.printerControls.isActive
		},
		fanPercent() {
			const raw = this.printStore.printerState.fanSpeed
			if (raw == null) {
				return this.fan
			}
			return Math.round(raw * 100)
		},
	},
	watch: {
		'printStore.printerState.speedFactor'(val) {
			if (typeof val === 'number' && val > 0) {
				this.speed = Math.round(val * 100)
			}
		},
		'printStore.printerState.flowFactor'(val) {
			if (typeof val === 'number' && val > 0) {
				this.flow = Math.round(val * 100)
			}
		},
		'printStore.printerState.fanSpeed'(val) {
			if (typeof val === 'number') {
				this.fan = Math.round(val * 100)
			}
		},
	},
	methods: {
		async apply(action, value) {
			this.busy = true
			try {
				if (action === 'speed') {
					await setSpeedFactor(value, this.printerId)
				} else if (action === 'flow') {
					await setFlowFactor(value, this.printerId)
				} else if (action === 'fan') {
					const pwm = Math.round((value / 100) * 255)
					await setFanSpeed(pwm, this.printerId)
				} else if (action === 'babystep') {
					await babystepZ(value, this.printerId)
					this.babystep = 0
				}
				await this.printStore.refreshPrinterState()
			} catch (e) {
				toastError('Tuning command failed', e)
			} finally {
				this.busy = false
			}
		},
		onSpeedInput() {
			void this.apply('speed', this.speed)
		},
		onFlowInput() {
			void this.apply('flow', this.flow)
		},
		onFanInput() {
			void this.apply('fan', this.fan)
		},
		onBabystep(delta) {
			void this.apply('babystep', delta)
		},
	},
}
</script>

<template>
	<div v-if="show" class="nc-print-card nc-print-tuning">
		<h2 class="nc-print-card__title">
			<span class="nc-print-card__title-row">
				<NcPrintIcon name="layers" :size="18" />
				Live tuning
			</span>
		</h2>
		<p class="nc-print-tuning__lead">
			Adjust speed, flow, fan, and Z offset while printing.
		</p>

		<div class="nc-print-card--inset">
			<p class="nc-print-section-label">Speed &amp; flow</p>
			<div class="nc-print-tuning__slider">
				<label>Speed {{ speed }}%</label>
				<input v-model.number="speed" type="range" min="50" max="200" step="1" :disabled="busy" @change="onSpeedInput">
			</div>
			<div class="nc-print-tuning__slider">
				<label>Flow {{ flow }}%</label>
				<input v-model.number="flow" type="range" min="50" max="200" step="1" :disabled="busy" @change="onFlowInput">
			</div>
		</div>

		<div class="nc-print-card--inset nc-print-tuning__inset-gap">
			<p class="nc-print-section-label">Cooling &amp; Z</p>
			<div class="nc-print-tuning__slider">
				<label>Fan {{ fan }}% <span v-if="fanPercent !== fan" class="nc-print-tuning__hint">(live {{ fanPercent }}%)</span></label>
				<input v-model.number="fan" type="range" min="0" max="100" step="1" :disabled="busy" @change="onFanInput">
			</div>
			<div class="nc-print-tuning__babystep">
				<span>Babystep Z</span>
				<div class="nc-print-actions">
					<button type="button" class="nc-print-btn" :disabled="busy" @click="onBabystep(-0.05)">
						−0.05
					</button>
					<button type="button" class="nc-print-btn" :disabled="busy" @click="onBabystep(0.05)">
						+0.05
					</button>
				</div>
			</div>
		</div>
	</div>
</template>

<style scoped>
.nc-print-tuning__lead {
	color: var(--nc-gcs-text-muted);
	font-size: var(--nc-gcs-text-sm);
	margin: 0 0 12px;
}

.nc-print-tuning__inset-gap {
	margin-top: var(--nc-gcs-space-md);
}
.nc-print-tuning__slider {
	display: flex;
	flex-direction: column;
	gap: 4px;
	margin-bottom: 12px;
}

.nc-print-tuning__slider label {
	color: var(--nc-gcs-text-secondary);
	font-size: var(--nc-gcs-text-sm);
}

.nc-print-tuning__babystep {
	align-items: center;
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	justify-content: space-between;
}

.nc-print-tuning__hint {
	color: var(--nc-gcs-text-muted);
	font-size: 11px;
}
</style>
