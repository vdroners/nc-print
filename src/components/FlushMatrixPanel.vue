<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { fetchFlushMatrix } from '@/services/color-order-api.js'
import { toastError } from '@/services/toast.js'

// A small default palette so each AMS slot starts on a distinct colour.
const DEFAULT_PALETTE = ['#e5484b', '#4c8eda', '#46ba61', '#e0a800', '#9d7bff', '#2ec5ff', '#ff7ac6', '#8b949e']

/**
 * AMS flush-matrix panel (v1.69) — multi-material only. One colour swatch per
 * tool slot; computes the change-to-change purge matrix (volume + grams) via the
 * sidecar's flush model so the operator can see which colour transitions are
 * expensive and load the AMS accordingly. Gated behind extruderCount > 1, so a
 * single-extruder printer never sees it (zero regression). Degrades to a hint if
 * the endpoint is unavailable (older sidecar).
 */
export default {
	name: 'FlushMatrixPanel',
	data() {
		return {
			colors: [],
			matrix: null,
			grams: null,
			names: [],
			unit: 'mm3', // 'mm3' | 'g'
			busy: false,
			unavailable: false,
		}
	},
	computed: {
		...mapStores(usePrintStore),
		extruderCount() {
			return this.printStore.extruderCount
		},
		show() {
			return this.extruderCount > 1
		},
		maxVal() {
			const grid = this.unit === 'g' ? this.grams : this.matrix
			if (!grid) {
				return 1
			}
			let m = 0
			for (const row of grid) {
				for (const v of row) {
					m = Math.max(m, v)
				}
			}
			return m || 1
		},
	},
	watch: {
		extruderCount: {
			immediate: true,
			handler() {
				this._seedColors()
			},
		},
	},
	methods: {
		_seedColors() {
			const n = this.extruderCount
			if (n < 2) {
				return
			}
			const next = []
			for (let i = 0; i < n; i++) {
				next.push(this.colors[i] || DEFAULT_PALETTE[i % DEFAULT_PALETTE.length])
			}
			this.colors = next
		},
		cellValue(i, j) {
			if (i === j) {
				return ''
			}
			const grid = this.unit === 'g' ? this.grams : this.matrix
			if (!grid) {
				return ''
			}
			const v = grid[i]?.[j]
			return this.unit === 'g' ? v?.toFixed(2) : Math.round(v)
		},
		cellStyle(i, j) {
			if (i === j || !this.matrix) {
				return {}
			}
			const grid = this.unit === 'g' ? this.grams : this.matrix
			const v = grid?.[i]?.[j] || 0
			const t = Math.min(1, v / this.maxVal)
			// green (low purge) → red (high purge)
			const hue = Math.round(120 * (1 - t))
			return { background: `hsl(${hue}, 65%, 42%)` }
		},
		async compute() {
			if (this.colors.length < 2) {
				return
			}
			this.busy = true
			this.unavailable = false
			try {
				const res = await fetchFlushMatrix({ colors: this.colors })
				this.matrix = res.matrix
				this.grams = res.grams
				this.names = res.names || []
			} catch (e) {
				if (e?.response?.status === 404) {
					this.unavailable = true
				} else {
					toastError('Flush matrix unavailable', e)
				}
			} finally {
				this.busy = false
			}
		},
	},
}
</script>

<template>
	<div v-if="show" class="nc-print-flush">
		<div class="nc-print-flush__head">
			<span class="nc-print-flush__title">AMS flush matrix</span>
			<div class="nc-print-flush__unit">
				<button type="button" :class="{ 'is-active': unit === 'mm3' }" @click="unit = 'mm3'">mm³</button>
				<button type="button" :class="{ 'is-active': unit === 'g' }" @click="unit = 'g'">g</button>
			</div>
		</div>
		<p class="nc-print-flush__hint">
			Purge to change from the row colour to the column colour. Set each AMS
			slot's colour, then compute — red transitions waste the most filament.
		</p>
		<div class="nc-print-flush__slots">
			<label v-for="(c, i) in colors" :key="'slot-' + i" class="nc-print-flush__slot">
				<span>Slot {{ i + 1 }}</span>
				<input v-model="colors[i]" type="color">
			</label>
		</div>
		<button type="button" class="nc-print-btn" :disabled="busy" @click="compute">
			{{ busy ? 'Computing…' : 'Compute flush matrix' }}
		</button>
		<p v-if="unavailable" class="nc-print-flush__hint">
			Flush matrix needs an updated slicer service — rebuild the sidecar.
		</p>
		<table v-if="matrix" class="nc-print-flush__grid">
			<thead>
				<tr>
					<th></th>
					<th v-for="(c, j) in colors" :key="'ch-' + j">
						<span class="nc-print-flush__dot" :style="{ background: c }" />
					</th>
				</tr>
			</thead>
			<tbody>
				<tr v-for="(c, i) in colors" :key="'row-' + i">
					<th><span class="nc-print-flush__dot" :style="{ background: c }" /></th>
					<td v-for="(c2, j) in colors" :key="'cell-' + i + '-' + j" :style="cellStyle(i, j)">
						{{ cellValue(i, j) }}
					</td>
				</tr>
			</tbody>
		</table>
	</div>
</template>

<style scoped>
.nc-print-flush {
	border-top: 1px solid var(--nc-gcs-border);
	margin-top: var(--nc-gcs-space-sm);
	padding-top: var(--nc-gcs-space-sm);
}

.nc-print-flush__head {
	align-items: center;
	display: flex;
	gap: var(--nc-gcs-space-sm);
	justify-content: space-between;
}

.nc-print-flush__title {
	font-size: var(--nc-gcs-text-sm);
	font-weight: 700;
}

.nc-print-flush__unit button {
	appearance: none;
	background: transparent;
	border: 1px solid var(--nc-gcs-border);
	color: var(--nc-gcs-text-muted);
	cursor: pointer;
	font-size: 11px;
	padding: 2px 8px;
}

.nc-print-flush__unit button.is-active {
	background: var(--nc-app-accent, var(--color-primary-element));
	color: var(--color-primary-element-text, #fff);
}

.nc-print-flush__hint {
	color: var(--color-text-maxcontrast, #8b949e);
	font-size: 0.78rem;
	margin: 4px 0 var(--nc-gcs-space-sm);
}

.nc-print-flush__slots {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	margin-bottom: var(--nc-gcs-space-sm);
}

.nc-print-flush__slot {
	align-items: center;
	display: flex;
	flex-direction: column;
	font-size: 11px;
	gap: 2px;
}

.nc-print-flush__grid {
	border-collapse: collapse;
	margin-top: var(--nc-gcs-space-sm);
}

.nc-print-flush__grid th,
.nc-print-flush__grid td {
	border: 1px solid var(--nc-gcs-border);
	font-size: 11px;
	min-width: 34px;
	padding: 4px 6px;
	text-align: center;
}

.nc-print-flush__grid td {
	color: #fff;
	font-variant-numeric: tabular-nums;
}

.nc-print-flush__dot {
	border-radius: 50%;
	display: inline-block;
	height: 12px;
	width: 12px;
}
</style>
