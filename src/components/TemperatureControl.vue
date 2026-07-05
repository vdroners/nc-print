<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { setTemperature, cooldown } from '@/services/moonraker-api.js'
import { toastError, toastSuccess } from '@/services/toast.js'
import TemperatureSparkline from './TemperatureSparkline.vue'
import NcPrintIcon from './NcPrintIcon.vue'

const PRESETS = {
	PLA: { nozzle: 210, bed: 60 },
	PETG: { nozzle: 240, bed: 80 },
	ABS: { nozzle: 245, bed: 100 },
}

export default {
	name: 'TemperatureControl',
	components: { TemperatureSparkline, NcPrintIcon },
	data() {
		return {
			nozzleInput: '',
			bedInput: '',
			busy: false,
			nozzleSamples: [],
			bedSamples: [],
			_sampleTimer: null,
		}
	},
	computed: {
		...mapStores(usePrintStore),
		printerId() {
			return this.printStore.selectedPrinterId || undefined
		},
		disabled() {
			return !this.printStore.printerState.connected || this.busy
		},
		nozzleLabel() {
			const cur = this.printStore.printerState.extruderTemp
			const tgt = this.printStore.printerState.extruderTarget
			if (cur == null) {
				return '—'
			}
			const curR = Math.round(cur)
			if (tgt != null && tgt > 0) {
				return `${curR} / ${Math.round(tgt)}°C`
			}
			return `${curR}°C`
		},
		bedLabel() {
			const cur = this.printStore.printerState.bedTemp
			const tgt = this.printStore.printerState.bedTarget
			if (cur == null) {
				return '—'
			}
			const curR = Math.round(cur)
			if (tgt != null && tgt > 0) {
				return `${curR} / ${Math.round(tgt)}°C`
			}
			return `${curR}°C`
		},
	},
	watch: {
		'printStore.printerState.extruderTemp'(val) {
			if (typeof val === 'number') {
				this._pushSample('nozzleSamples', val)
			}
		},
		'printStore.printerState.bedTemp'(val) {
			if (typeof val === 'number') {
				this._pushSample('bedSamples', val)
			}
		},
	},
	mounted() {
		this._sampleTimer = setInterval(() => this._trimSamples(), 15000)
	},
	beforeDestroy() {
		if (this._sampleTimer) {
			clearInterval(this._sampleTimer)
		}
	},
	methods: {
		_pushSample(key, value) {
			const now = Date.now()
			const rows = [...this[key], { t: now, value }]
			const cutoff = now - 5 * 60 * 1000
			this[key] = rows.filter(r => r.t >= cutoff)
		},
		_trimSamples() {
			const cutoff = Date.now() - 5 * 60 * 1000
			this.nozzleSamples = this.nozzleSamples.filter(r => r.t >= cutoff)
			this.bedSamples = this.bedSamples.filter(r => r.t >= cutoff)
		},
		async withBusy(fn) {
			this.busy = true
			let ok = false
			try {
				await fn()
				await this.printStore.refreshPrinterState()
				ok = true
			} catch (e) {
				toastError('Temperature command failed', e)
			} finally {
				this.busy = false
			}
			return ok
		},
		async applyTargets() {
			const nozzle = this.nozzleInput !== '' ? Number(this.nozzleInput) : undefined
			const bed = this.bedInput !== '' ? Number(this.bedInput) : undefined
			if (nozzle == null && bed == null) {
				toastError('Enter a nozzle or bed target temperature')
				return
			}
			const ok = await this.withBusy(() => setTemperature({ nozzle, bed }, this.printerId))
			if (ok) {
				toastSuccess('Temperature targets sent')
			}
		},
		async preheat(preset) {
			const row = PRESETS[preset]
			if (!row) {
				return
			}
			this.nozzleInput = String(row.nozzle)
			this.bedInput = String(row.bed)
			const ok = await this.withBusy(() => setTemperature({ nozzle: row.nozzle, bed: row.bed }, this.printerId))
			if (ok) {
				toastSuccess(`${preset} preheat started`)
			}
		},
		async onCooldown() {
			const ok = await this.withBusy(() => cooldown(this.printerId))
			if (ok) {
				this.nozzleInput = '0'
				this.bedInput = '0'
				toastSuccess('Cooling down')
			}
		},
	},
}
</script>

<template>
	<div class="nc-print-card nc-print-temp-control">
		<h2 class="nc-print-card__title">
			<span class="nc-print-card__title-row">
				<NcPrintIcon name="thermometer" :size="18" />
				Temperature
			</span>
		</h2>

		<div class="nc-print-card--inset nc-print-temp-control__readouts">
			<p class="nc-print-section-label">Live readouts</p>
			<div class="nc-print-temp-control__row">
				<span>Nozzle</span>
				<strong>{{ nozzleLabel }}</strong>
				<span
					v-if="printStore.isExtruderHeating"
					class="nc-print-badge nc-print-badge--warn">
					Heating
				</span>
			</div>
			<div class="nc-print-temp-control__row">
				<span>Bed</span>
				<strong>{{ bedLabel }}</strong>
				<span
					v-if="printStore.isBedHeating"
					class="nc-print-badge nc-print-badge--warn">
					Heating
				</span>
			</div>
		</div>

		<div class="nc-print-temp-control__sparklines">
			<TemperatureSparkline label="Nozzle (5 min)" :samples="nozzleSamples" color="#f97316" />
			<TemperatureSparkline label="Bed (5 min)" :samples="bedSamples" color="#3b82f6" />
		</div>

		<div class="nc-print-row nc-print-row--equal">
			<div class="nc-print-field">
				<label for="nc-print-nozzle-temp">Nozzle target (°C)</label>
				<input
					id="nc-print-nozzle-temp"
					v-model="nozzleInput"
					type="number"
					min="0"
					max="300"
					step="1"
					:disabled="disabled"
					placeholder="210">
			</div>
			<div class="nc-print-field">
				<label for="nc-print-bed-temp">Bed target (°C)</label>
				<input
					id="nc-print-bed-temp"
					v-model="bedInput"
					type="number"
					min="0"
					max="120"
					step="1"
					:disabled="disabled"
					placeholder="60">
			</div>
		</div>

		<div class="nc-print-actions">
			<button type="button" class="nc-print-btn nc-print-btn--primary" :disabled="disabled" @click="applyTargets">
				Set temps
			</button>
			<button type="button" class="nc-print-btn" :disabled="disabled" @click="preheat('PLA')">
				PLA
			</button>
			<button type="button" class="nc-print-btn" :disabled="disabled" @click="preheat('PETG')">
				PETG
			</button>
			<button type="button" class="nc-print-btn" :disabled="disabled" @click="preheat('ABS')">
				ABS
			</button>
			<button type="button" class="nc-print-btn" :disabled="disabled" @click="onCooldown">
				Cooldown
			</button>
		</div>
	</div>
</template>

<style scoped>
.nc-print-temp-control__readouts {
	display: flex;
	flex-direction: column;
	gap: 8px;
	margin-bottom: 12px;
}

.nc-print-temp-control__row {
	align-items: center;
	display: flex;
	flex-wrap: wrap;
	font-size: var(--nc-gcs-text-sm);
	gap: 8px;
}

.nc-print-temp-control__sparklines {
	display: grid;
	gap: 8px;
	grid-template-columns: 1fr 1fr;
	margin-bottom: 12px;
}
</style>
