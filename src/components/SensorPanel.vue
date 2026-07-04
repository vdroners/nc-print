<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { moonrakerGet } from '@/services/moonraker-api.js'

/**
 * Read-only sensor detail: extra temperature sensors (chamber, MCU, etc.) and
 * filament switch/motion sensors, parsed from printer.objects (already
 * allowlisted). Only rows that actually exist are shown; the whole panel hides
 * when the printer reports no such sensors.
 */
export default {
	name: 'SensorPanel',
	data() {
		return {
			temps: [],      // { name, temp }
			filament: [],   // { name, detected }
			loadError: '',
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
		hasAny() {
			return this.temps.length > 0 || this.filament.length > 0
		},
	},
	watch: {
		connected(now) {
			if (now) {
				void this.load()
			}
		},
	},
	mounted() {
		if (this.connected) {
			void this.load()
		}
		this._timer = setInterval(() => {
			if (this.connected) {
				void this.load()
			}
		}, 10000)
	},
	beforeDestroy() {
		if (this._timer) {
			clearInterval(this._timer)
		}
	},
	methods: {
		async load() {
			try {
				// Discover which sensor objects exist, then query them.
				const list = await moonrakerGet('printer/objects/list', {}, this.printerId)
				const objects = list?.result?.objects ?? list?.objects ?? []
				const wanted = objects.filter(o =>
					o.startsWith('temperature_sensor ')
					|| o.startsWith('filament_switch_sensor ')
					|| o.startsWith('filament_motion_sensor '))
				if (!wanted.length) {
					this.temps = []
					this.filament = []
					return
				}
				const params = {}
				for (const o of wanted) {
					params[o] = ''
				}
				const res = await moonrakerGet('printer/objects/query', params, this.printerId)
				const status = res?.result?.status ?? res?.status ?? {}
				const temps = []
				const filament = []
				for (const [key, val] of Object.entries(status)) {
					if (key.startsWith('temperature_sensor ') && val && typeof val.temperature === 'number') {
						temps.push({ name: key.slice('temperature_sensor '.length), temp: val.temperature })
					} else if (key.startsWith('filament_switch_sensor ') || key.startsWith('filament_motion_sensor ')) {
						const label = key.slice(key.indexOf(' ') + 1)
						filament.push({ name: label, detected: !!(val && val.filament_detected) })
					}
				}
				this.temps = temps
				this.filament = filament
				this.loadError = ''
			} catch (e) {
				this.loadError = e?.message || 'Sensors unavailable'
			}
		},
	},
}
</script>

<template>
	<div v-if="hasAny" class="nc-print-sensors nc-print-card">
		<h3 class="nc-print-sensors__title">Sensors</h3>
		<div class="nc-print-sensors__grid">
			<div v-for="t in temps" :key="'t-' + t.name" class="nc-print-sensors__cell">
				<span class="nc-print-sensors__label">{{ t.name }}</span>
				<span class="nc-print-sensors__val">{{ Math.round(t.temp) }}°C</span>
			</div>
			<div v-for="f in filament" :key="'f-' + f.name" class="nc-print-sensors__cell">
				<span class="nc-print-sensors__label">{{ f.name }}</span>
				<span class="nc-print-sensors__val" :class="{ 'is-ok': f.detected, 'is-out': !f.detected }">
					{{ f.detected ? 'Loaded' : 'Runout' }}
				</span>
			</div>
		</div>
	</div>
</template>

<style scoped>
.nc-print-sensors__title { font-size: var(--nc-gcs-text-sm); font-weight: 600; margin: var(--nc-gcs-space-sm) 0; }
.nc-print-sensors__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; }
.nc-print-sensors__cell { display: flex; flex-direction: column; gap: 2px; }
.nc-print-sensors__label { font-size: 0.72rem; color: var(--color-text-maxcontrast, #8b949e); text-transform: capitalize; }
.nc-print-sensors__val { font-size: 0.9rem; font-weight: 600; }
.nc-print-sensors__val.is-ok { color: var(--color-success, #4caf50); }
.nc-print-sensors__val.is-out { color: var(--color-warning, #d9a441); }
</style>
