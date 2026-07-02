<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { moonrakerGet, pidCalibrate } from '@/services/moonraker-api.js'
import { toastError, toastSuccess } from '@/services/toast.js'
import NcPrintIcon from './NcPrintIcon.vue'
import {
	parseTemperatureStore,
	temperatureDomain,
	seriesToPoints,
} from '@/utils/temperature.js'

const SENSOR_COLORS = ['#f97316', '#3b82f6', '#10b981', '#a855f7', '#eab308', '#ef4444']
const POLL_MS = 4000
const VIEW_W = 480
const VIEW_H = 160

export default {
	name: 'TemperatureGraph',
	components: { NcPrintIcon },
	data() {
		return {
			sensors: [],
			loadError: '',
			pidBusy: false,
			_timer: null,
			viewW: VIEW_W,
			viewH: VIEW_H,
		}
	},
	computed: {
		...mapStores(usePrintStore),
		printerId() {
			return this.printStore.selectedPrinterId || undefined
		},
		connected() {
			return this.printStore.printerState.connected
		},
		pidEnabled() {
			// Admin-gated like the console (security-sensitive calibration).
			return this.printStore.consoleEnabled && !this.printStore.printerControls.isActive
		},
		domain() {
			return temperatureDomain(this.sensors)
		},
		plotSensors() {
			return this.sensors.map((s, i) => ({
				...s,
				color: SENSOR_COLORS[i % SENSOR_COLORS.length],
				points: seriesToPoints(s.temperatures, {
					width: this.viewW,
					height: this.viewH,
					min: this.domain.min,
					max: this.domain.max,
				}),
				targetPoints: s.isHeater && s.targets.length
					? seriesToPoints(s.targets, {
						width: this.viewW,
						height: this.viewH,
						min: this.domain.min,
						max: this.domain.max,
					})
					: '',
				current: s.temperatures.length ? Math.round(s.temperatures[s.temperatures.length - 1]) : null,
			}))
		},
		gridLines() {
			const { min, max } = this.domain
			const step = (max - min) / 4
			return [0, 1, 2, 3, 4].map(i => {
				const value = Math.round(min + step * i)
				const y = this.viewH - (i / 4) * this.viewH
				return { value, y }
			})
		},
	},
	watch: {
		connected(now) {
			if (now) {
				this.startPolling()
			} else {
				this.stopPolling()
			}
		},
	},
	mounted() {
		if (this.connected) {
			this.startPolling()
		}
	},
	beforeDestroy() {
		this.stopPolling()
	},
	methods: {
		startPolling() {
			this.stopPolling()
			void this.refresh()
			this._timer = setInterval(() => this.refresh(), POLL_MS)
		},
		stopPolling() {
			if (this._timer) {
				clearInterval(this._timer)
				this._timer = null
			}
		},
		async refresh() {
			try {
				const data = await moonrakerGet('server/temperature_store', {}, this.printerId)
				this.sensors = parseTemperatureStore(data)
				this.loadError = ''
			} catch (e) {
				this.loadError = e?.message || 'Temperature history unavailable'
			}
		},
		async runPidTune(heater) {
			const target = heater === 'heater_bed' ? 60 : 210
			if (!window.confirm(`Run PID calibration on ${heater} at ${target}°C? The printer will heat and cycle for several minutes.`)) {
				return
			}
			this.pidBusy = true
			try {
				await pidCalibrate(heater, target, this.printerId)
				toastSuccess(`PID calibration started on ${heater}`)
			} catch (e) {
				toastError('PID calibration failed', e)
			} finally {
				this.pidBusy = false
			}
		},
	},
}
</script>

<template>
	<div v-if="connected" class="nc-print-card nc-print-temp-graph">
		<h2 class="nc-print-card__title">
			<span class="nc-print-card__title-row">
				<NcPrintIcon name="thermometer" :size="18" />
				Temperature history
			</span>
		</h2>

		<p v-if="loadError" class="nc-print-temp-graph__error">{{ loadError }}</p>

		<div v-else-if="plotSensors.length" class="nc-print-temp-graph__chart">
			<svg :viewBox="`0 0 ${viewW} ${viewH}`" preserveAspectRatio="none" role="img" aria-label="Temperature history graph">
				<line
					v-for="g in gridLines"
					:key="`grid-${g.value}`"
					x1="0"
					:y1="g.y"
					:x2="viewW"
					:y2="g.y"
					class="nc-print-temp-graph__grid" />
				<g v-for="s in plotSensors" :key="s.key">
					<polyline
						v-if="s.targetPoints"
						:points="s.targetPoints"
						fill="none"
						:stroke="s.color"
						stroke-width="1"
						stroke-dasharray="3 3"
						opacity="0.5" />
					<polyline
						:points="s.points"
						fill="none"
						:stroke="s.color"
						stroke-width="1.5" />
				</g>
			</svg>
			<div class="nc-print-temp-graph__axis">
				<span v-for="g in gridLines" :key="`axis-${g.value}`">{{ g.value }}°</span>
			</div>
		</div>

		<div v-if="plotSensors.length" class="nc-print-temp-graph__legend">
			<span v-for="s in plotSensors" :key="`legend-${s.key}`" class="nc-print-temp-graph__legend-item">
				<span class="nc-print-temp-graph__swatch" :style="{ background: s.color }" />
				{{ s.label }}
				<strong v-if="s.current != null">{{ s.current }}°</strong>
			</span>
		</div>

		<div v-if="pidEnabled" class="nc-print-actions nc-print-temp-graph__pid">
			<span class="nc-print-section-label">PID calibration (admin)</span>
			<button type="button" class="nc-print-btn nc-print-btn--sm" :disabled="pidBusy" @click="runPidTune('extruder')">
				Tune nozzle
			</button>
			<button type="button" class="nc-print-btn nc-print-btn--sm" :disabled="pidBusy" @click="runPidTune('heater_bed')">
				Tune bed
			</button>
		</div>
	</div>
</template>

<style scoped>
.nc-print-temp-graph__chart {
	display: flex;
	gap: 6px;
}

.nc-print-temp-graph__chart svg {
	background: var(--nc-gcs-bg-app, rgba(0, 0, 0, 0.15));
	border-radius: var(--nc-gcs-radius-sm, 4px);
	flex: 1;
	height: 160px;
	width: 100%;
}

.nc-print-temp-graph__grid {
	stroke: var(--nc-gcs-border);
	stroke-width: 0.5;
	opacity: 0.4;
}

.nc-print-temp-graph__axis {
	color: var(--nc-gcs-text-muted);
	display: flex;
	flex-direction: column-reverse;
	font-size: 10px;
	justify-content: space-between;
	width: 32px;
}

.nc-print-temp-graph__legend {
	display: flex;
	flex-wrap: wrap;
	gap: 12px;
	margin-top: 8px;
}

.nc-print-temp-graph__legend-item {
	align-items: center;
	display: inline-flex;
	font-size: var(--nc-gcs-text-sm);
	gap: 4px;
}

.nc-print-temp-graph__swatch {
	border-radius: 2px;
	display: inline-block;
	height: 10px;
	width: 10px;
}

.nc-print-temp-graph__pid {
	align-items: center;
	margin-top: 12px;
}

.nc-print-temp-graph__error {
	color: var(--nc-gcs-text-muted);
	font-size: var(--nc-gcs-text-sm);
}
</style>
