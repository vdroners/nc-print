<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { setTemperature, cooldown, moonrakerGet } from '@/services/moonraker-api.js'
import {
	appendTemperatureSample,
	followLiveTarget,
	parseTemperatureStore,
	samplesFromTemperatureSeries,
} from '@/utils/temperature.js'
import { toastError, toastSuccess } from '@/services/toast.js'
import TemperatureSparkline from './TemperatureSparkline.vue'
import NcPrintIcon from './NcPrintIcon.vue'

const PRESETS = {
	PLA: { nozzle: 210, bed: 60 },
	PETG: { nozzle: 240, bed: 80 },
	ABS: { nozzle: 245, bed: 100 },
}

/** Same cadence as the temperature-history panel. */
const SERIES_POLL_MS = 4000

export default {
	name: 'TemperatureControl',
	components: { TemperatureSparkline, NcPrintIcon },
	data() {
		return {
			nozzleInput: '',
			bedInput: '',
			nozzleTouched: false,
			bedTouched: false,
			busy: false,
			nozzleSamples: [],
			bedSamples: [],
		}
	},
	created() {
		this._seriesSeq = 0
		this._seriesTimer = null
		this._seriesAlive = true
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
		'printStore.printerState.extruderTarget': {
			immediate: true,
			handler(val) {
				this.nozzleInput = followLiveTarget(this.nozzleInput, val, this.nozzleTouched)
			},
		},
		'printStore.printerState.bedTarget': {
			immediate: true,
			handler(val) {
				this.bedInput = followLiveTarget(this.bedInput, val, this.bedTouched)
			},
		},
		// A steady heater does not change extruderTemp, so watching the number
		// leaves the 5-minute chart empty (one bump draws as a stray tick).
		// Poll Moonraker's temperature store, and fall back to a timed sample.
		'printStore.printerState.connected'(connected) {
			if (connected) {
				void this.refreshSeries()
			}
		},
		printerId() {
			void this.refreshSeries()
		},
	},
	mounted() {
		void this.refreshSeries()
		this._seriesTimer = setInterval(() => {
			void this.refreshSeries()
		}, SERIES_POLL_MS)
	},
	beforeDestroy() {
		this._seriesAlive = false
		if (this._seriesTimer) {
			clearInterval(this._seriesTimer)
			this._seriesTimer = null
		}
	},
	methods: {
		_captureLive(key, value, now) {
			this[key] = appendTemperatureSample(this[key], value, now)
		},
		async refreshSeries() {
			const seq = ++this._seriesSeq
			const now = Date.now()
			const stale = () => !this._seriesAlive || seq !== this._seriesSeq
			if (this.printStore.printerState.connected) {
				try {
					const data = await moonrakerGet('server/temperature_store', {}, this.printerId)
					if (stale()) {
						return
					}
					const sensors = parseTemperatureStore(data)
					const nozzle = sensors.find((s) => s.key === 'extruder')
					const bed = sensors.find((s) => s.key === 'heater_bed')
					const nozzleSamples = nozzle
						? samplesFromTemperatureSeries(nozzle.temperatures, { now })
						: []
					const bedSamples = bed
						? samplesFromTemperatureSeries(bed.temperatures, { now })
						: []
					if (nozzleSamples.length >= 2) {
						this.nozzleSamples = nozzleSamples
					} else {
						this._captureLive('nozzleSamples', this.printStore.printerState.extruderTemp, now)
					}
					if (bedSamples.length >= 2) {
						this.bedSamples = bedSamples
					} else {
						this._captureLive('bedSamples', this.printStore.printerState.bedTemp, now)
					}
					return
				} catch {
					if (stale()) {
						return
					}
				}
			}
			if (stale()) {
				return
			}
			this._captureLive('nozzleSamples', this.printStore.printerState.extruderTemp, now)
			this._captureLive('bedSamples', this.printStore.printerState.bedTemp, now)
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
			this.nozzleTouched = true
			this.bedTouched = true
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
				this.nozzleTouched = true
				this.bedTouched = true
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
				<span class="nc-print-temp-control__name">Nozzle</span>
				<strong>{{ nozzleLabel }}</strong>
				<span
					v-if="printStore.isExtruderHeating"
					class="nc-print-badge nc-print-badge--warn">
					Heating
				</span>
			</div>
			<div class="nc-print-temp-control__row">
				<span class="nc-print-temp-control__name">Bed</span>
				<strong>{{ bedLabel }}</strong>
				<span
					v-if="printStore.isBedHeating"
					class="nc-print-badge nc-print-badge--warn">
					Heating
				</span>
			</div>
		</div>

		<div class="nc-print-temp-control__sparklines">
			<TemperatureSparkline label="Nozzle (5 min)" :samples="nozzleSamples" color="#f97316" :height="120" />
			<TemperatureSparkline label="Bed (5 min)" :samples="bedSamples" color="#3b82f6" :height="120" />
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
					@input="nozzleTouched = true">
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
					@input="bedTouched = true">
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
.nc-print-temp-control {
	display: flex;
	flex-direction: column;
	max-width: 720px;
}

.nc-print-temp-control__name {
	color: var(--nc-gcs-text-primary, #e6edf3);
	flex: 0 0 4.75rem;
	font-size: 14px;
	font-weight: 600;
}

.nc-print-temp-control__row strong {
	font-size: 16px;
	font-variant-numeric: tabular-nums;
}

.nc-print-temp-control :deep(.nc-print-field label),
.nc-print-temp-control .nc-print-field label {
	color: var(--nc-gcs-text-primary, #e6edf3);
	font-size: 13px;
	font-weight: 600;
}

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

@media (min-width: 1600px) {
	.nc-print-temp-control__readouts {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px 16px;
	}

	/* The section label was a grid cell, so Nozzle landed in column 2. */
	.nc-print-temp-control__readouts > .nc-print-section-label {
		grid-column: 1 / -1;
	}
}
</style>
