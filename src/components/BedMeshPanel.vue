<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { moonrakerGet, bedMeshCalibrate } from '@/services/moonraker-api.js'
import { toastError, toastSuccess } from '@/services/toast.js'
import NcPrintIcon from './NcPrintIcon.vue'
import { parseBedMesh, normalizeMeshCells, interpolateMatrix } from '@/utils/bed-mesh.js'

export default {
	name: 'BedMeshPanel',
	components: { NcPrintIcon },
	data() {
		return {
			mesh: null,
			supported: false,
			checked: false,
			calibrating: false,
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
		idle() {
			return !this.printStore.printerControls.isActive
		},
		// Display rows back-to-front so the front of the bed is at the bottom.
		// The matrix is bilinearly upsampled so the heatmap reads as a smooth
		// surface instead of a few large blocks; colours are normalized against
		// the original probed min/max so the scale stays truthful.
		displayRows() {
			if (!this.mesh) {
				return []
			}
			const fine = interpolateMatrix(this.mesh.matrix, 24)
			const cells = normalizeMeshCells(fine, { min: this.mesh.min, max: this.mesh.max })
			const byRow = []
			for (const cell of cells) {
				byRow[cell.row] = byRow[cell.row] || []
				byRow[cell.row].push(cell)
			}
			return byRow.slice().reverse()
		},
		rangeLabel() {
			if (!this.mesh) {
				return '—'
			}
			return `${(this.mesh.range * 1000).toFixed(0)} µm (${this.mesh.min.toFixed(3)} … ${this.mesh.max.toFixed(3)} mm)`
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
	beforeDestroy() {
		clearTimeout(this._calibrateTimer)
	},
	methods: {
		async load() {
			try {
				const data = await moonrakerGet('printer/objects/query', { bed_mesh: '' }, this.printerId)
				const parsed = parseBedMesh(data)
				const status = data?.result?.status ?? data?.status ?? {}
				this.supported = ('bed_mesh' in status) || parsed !== null
				this.mesh = parsed
				this.loadError = ''
			} catch (e) {
				this.loadError = e?.message || 'Bed mesh unavailable'
			} finally {
				this.checked = true
			}
		},
		async calibrate() {
			if (!window.confirm('Run BED_MESH_CALIBRATE? The printer will home and probe the bed.')) {
				return
			}
			this.calibrating = true
			try {
				await bedMeshCalibrate(this.printerId)
				toastSuccess('Bed mesh calibration started')
				// Refresh after a delay; probing takes time. Track the timer so
				// it can be cancelled on unmount / re-calibrate (avoids a
				// this.load() on a destroyed component and stale double-loads).
				clearTimeout(this._calibrateTimer)
				this._calibrateTimer = setTimeout(() => this.load(), 8000)
			} catch (e) {
				toastError('Bed mesh calibration failed', e)
			} finally {
				this.calibrating = false
			}
		},
	},
}
</script>

<template>
	<div v-if="connected && (supported || !checked)" class="nc-print-card nc-print-bedmesh">
		<div class="nc-print-card__header">
			<h2 class="nc-print-card__title">
				<span class="nc-print-card__title-row">
					<NcPrintIcon name="grid" :size="18" />
					Bed mesh
				</span>
			</h2>
			<button
				type="button"
				class="nc-print-btn nc-print-btn--sm"
				:disabled="calibrating || !idle"
				:title="idle ? 'Probe the bed' : 'Only available when idle'"
				@click="calibrate">
				Calibrate
			</button>
		</div>

		<p v-if="loadError" class="nc-print-bedmesh__msg">{{ loadError }}</p>

		<template v-else-if="mesh">
			<div class="nc-print-bedmesh__grid" role="img" aria-label="Bed mesh heatmap">
				<div v-for="(row, ri) in displayRows" :key="`row-${ri}`" class="nc-print-bedmesh__row">
					<span
						v-for="cell in row"
						:key="`cell-${cell.row}-${cell.col}`"
						class="nc-print-bedmesh__cell"
						:style="{ background: cell.color }"
						:title="`${cell.value.toFixed(3)} mm`" />
				</div>
			</div>
			<dl class="nc-print-bedmesh__stats">
				<div>
					<dt>Range</dt>
					<dd>{{ rangeLabel }}</dd>
				</div>
				<div v-if="mesh.profileName">
					<dt>Profile</dt>
					<dd>{{ mesh.profileName }}</dd>
				</div>
			</dl>
		</template>

		<p v-else-if="checked" class="nc-print-bedmesh__msg">
			No mesh loaded. Run calibration to probe the bed.
		</p>
	</div>
</template>

<style scoped>
.nc-print-bedmesh__grid {
	display: flex;
	flex-direction: column;
	gap: 1px;
	margin-bottom: 12px;
	/* Keep the (now finer) heatmap square-ish and compact. */
	max-width: 100%;
	aspect-ratio: 1;
}

.nc-print-bedmesh__row {
	display: flex;
	gap: 1px;
	flex: 1;
	min-height: 0;
}

.nc-print-bedmesh__cell {
	border-radius: 1px;
	flex: 1;
	min-width: 0;
}

.nc-print-bedmesh__stats {
	display: grid;
	gap: 8px;
	grid-template-columns: repeat(2, 1fr);
	margin: 0;
}

.nc-print-bedmesh__stats dt {
	color: var(--nc-gcs-text-muted);
	font-size: var(--nc-gcs-text-xs, 11px);
}

.nc-print-bedmesh__stats dd {
	font-size: var(--nc-gcs-text-sm);
	font-weight: 600;
	margin: 0;
}

.nc-print-bedmesh__msg {
	color: var(--nc-gcs-text-muted);
	font-size: var(--nc-gcs-text-sm);
}
</style>
