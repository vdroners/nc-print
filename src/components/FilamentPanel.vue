<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import {
	moonrakerGet,
	filamentLoad,
	filamentUnload,
	filamentPurge,
	filamentExtrude,
} from '@/services/moonraker-api.js'
import { toastError, toastSuccess } from '@/services/toast.js'
import { parseRunoutSensors, parseActiveSpoolId, parseSpools, filamentCost } from '@/utils/filament.js'
import { panelVisibility } from '@/mixins/panelVisibility.js'

export default {
	name: 'FilamentPanel',
	mixins: [panelVisibility],
	data() {
		return {
			sensors: [],
			spools: [],
			activeSpoolId: null,
			loadError: '',
			busy: false,
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
		idle() {
			return !this.printStore.printerControls.isActive
		},
		spoolmanSupported() {
			return this.printStore.hasFeature('spoolman')
		},
		activeSpool() {
			return this.spools.find(s => s.id === this.activeSpoolId) || null
		},
		// WS14: cost/usage estimate for the last completed slice.
		sliceCost() {
			const stats = this.printStore.lastCompletedSliceStats
			if (!stats) {
				return null
			}
			// Prefer the slicer's grams if present; otherwise derive from length.
			const grams = stats.filamentUsedG
			if (!grams) {
				return null
			}
			const price = this.activeSpool?.pricePerKg
			const cost = price ? (grams / 1000) * price : null
			return { grams, cost }
		},
		hasAnything() {
			return this.sensors.length > 0 || this.spoolmanSupported
		},
		panelVisible() {
			return this.connected && (this.hasAnything || !!this.sliceCost)
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
	},
	methods: {
		async load() {
			try {
				const list = await moonrakerGet('printer/objects/list', {}, this.printerId)
				const objects = list?.result?.objects ?? list?.objects ?? []
				const sensorKeys = objects.filter(o =>
					typeof o === 'string'
					&& (o.startsWith('filament_switch_sensor ') || o.startsWith('filament_motion_sensor ')))
				if (sensorKeys.length) {
					const params = {}
					for (const k of sensorKeys) {
						params[k] = ''
					}
					const q = await moonrakerGet('printer/objects/query', params, this.printerId)
					this.sensors = parseRunoutSensors(q)
				}
				if (this.spoolmanSupported) {
					const status = await moonrakerGet('server/spoolman/status', {}, this.printerId)
					this.activeSpoolId = parseActiveSpoolId(status)
					try {
						const spools = await moonrakerGet('server/spoolman/spool', {}, this.printerId)
						this.spools = parseSpools(spools)
					} catch {
						this.spools = []
					}
				}
				this.loadError = ''
			} catch (e) {
				this.loadError = e?.message || 'Filament status unavailable'
			}
		},
		async run(action) {
			this.busy = true
			try {
				if (action === 'load') {
					await filamentLoad(this.printerId)
				} else if (action === 'unload') {
					await filamentUnload(this.printerId)
				} else if (action === 'purge') {
					await filamentPurge(this.printerId)
				}
				toastSuccess(`Filament ${action} started`)
			} catch (e) {
				toastError(`Filament ${action} failed`, e)
			} finally {
				this.busy = false
			}
		},
		fmtCost(cost) {
			return cost != null ? cost.toFixed(2) : null
		},
		async move(distanceMm) {
			this.busy = true
			try {
				await filamentExtrude(distanceMm, this.printerId)
				toastSuccess(distanceMm > 0 ? `Extruded ${distanceMm} mm` : `Retracted ${Math.abs(distanceMm)} mm`)
			} catch (e) {
				toastError('Filament move failed', e)
			} finally {
				this.busy = false
			}
		},
	},
}
</script>

<template>
	<div v-if="panelVisible" class="nc-print-filament">
		<p v-if="loadError" class="nc-print-filament__msg">{{ loadError }}</p>

		<div v-if="sensors.length" class="nc-print-filament__sensors">
			<p class="nc-print-section-label">Runout sensors</p>
			<div v-for="s in sensors" :key="s.name" class="nc-print-filament__sensor">
				<span>{{ s.name }}</span>
				<span
					class="nc-print-badge"
					:class="s.detected ? 'nc-print-badge--ok' : 'nc-print-badge--warn'">
					{{ s.detected ? 'Detected' : 'Runout' }}
				</span>
				<span v-if="!s.enabled" class="nc-print-badge nc-print-badge--info">disabled</span>
			</div>
		</div>

		<div v-if="activeSpool" class="nc-print-filament__spool">
			<p class="nc-print-section-label">Active spool</p>
			<div class="nc-print-filament__spool-row">
				<span class="nc-print-filament__swatch" :style="{ background: activeSpool.color || '#888' }" />
				<span>{{ activeSpool.name }} <em v-if="activeSpool.material">({{ activeSpool.material }})</em></span>
				<strong v-if="activeSpool.remainingG != null">{{ Math.round(activeSpool.remainingG) }} g left</strong>
			</div>
		</div>

		<div v-if="sliceCost" class="nc-print-filament__cost">
			<p class="nc-print-section-label">Last slice</p>
			<span>{{ Math.round(sliceCost.grams) }} g</span>
			<span v-if="fmtCost(sliceCost.cost)"> · {{ fmtCost(sliceCost.cost) }}</span>
		</div>

		<div class="nc-print-actions">
			<button type="button" class="nc-print-btn nc-print-btn--sm" :disabled="busy || !idle" @click="run('load')">Load</button>
			<button type="button" class="nc-print-btn nc-print-btn--sm" :disabled="busy || !idle" @click="run('unload')">Unload</button>
			<button type="button" class="nc-print-btn nc-print-btn--sm" :disabled="busy || !idle" @click="run('purge')">Purge</button>
		</div>

		<div class="nc-print-filament__jog">
			<p class="nc-print-section-label">Extrude / retract (mm, idle only)</p>
			<div class="nc-print-actions">
				<button type="button" class="nc-print-btn nc-print-btn--sm" :disabled="busy || !idle" @click="move(-10)">− 10</button>
				<button type="button" class="nc-print-btn nc-print-btn--sm" :disabled="busy || !idle" @click="move(-1)">− 1</button>
				<button type="button" class="nc-print-btn nc-print-btn--sm" :disabled="busy || !idle" @click="move(0.1)">+ 0.1</button>
				<button type="button" class="nc-print-btn nc-print-btn--sm" :disabled="busy || !idle" @click="move(1)">+ 1</button>
				<button type="button" class="nc-print-btn nc-print-btn--sm" :disabled="busy || !idle" @click="move(10)">+ 10</button>
			</div>
		</div>
	</div>
</template>

<style scoped>
.nc-print-filament__sensor,
.nc-print-filament__spool-row {
	align-items: center;
	display: flex;
	font-size: var(--nc-gcs-text-sm);
	gap: 8px;
	margin-bottom: 6px;
}

.nc-print-filament__swatch {
	border: 1px solid var(--nc-gcs-border);
	border-radius: 50%;
	display: inline-block;
	height: 14px;
	width: 14px;
}

.nc-print-filament__cost {
	font-size: var(--nc-gcs-text-sm);
	margin-bottom: 8px;
}

.nc-print-filament__msg {
	color: var(--nc-gcs-text-muted);
	font-size: var(--nc-gcs-text-sm);
}
</style>
