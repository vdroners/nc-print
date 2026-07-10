<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { formatPrintTime } from '@/services/slicer-utils.js'

/**
 * Durable, per-user print history (v1.37) — distinct from HistoryPanel, which
 * mirrors the printer's own Moonraker job history. This panel reads the app's
 * DB-backed history and shows quality metrics + heuristic consumable-wear
 * estimates. Loads on first expand (best-effort; store swallows failures).
 */
export default {
	name: 'PrintHistoryPanel',
	data() {
		return {
			open: false,
			loaded: false,
		}
	},
	computed: {
		...mapStores(usePrintStore),
		h() {
			return this.printStore.history
		},
		metrics() {
			return this.h.metrics?.overall || null
		},
		wearPrinters() {
			return this.h.wear?.printers || []
		},
		wearHints() {
			const all = this.wearPrinters.flatMap((w) => w.service_hints || [])
			return [...new Set(all)]
		},
		resultOptions() {
			return [
				{ value: '', label: 'All results' },
				{ value: 'complete', label: 'Complete' },
				{ value: 'error', label: 'Failed' },
				{ value: 'cancel', label: 'Cancelled' },
			]
		},
	},
	methods: {
		async toggle() {
			this.open = !this.open
			if (this.open && !this.loaded) {
				await this.reload()
				this.loaded = true
			}
		},
		async reload() {
			await Promise.all([
				this.printStore.fetchHistory({ reset: true }),
				this.printStore.fetchHistoryMetrics(),
				this.printStore.fetchHistoryWear(),
			])
		},
		async applyFilters() {
			await this.printStore.fetchHistory({ reset: true })
		},
		resultLabel(r) {
			return { complete: 'Complete', error: 'Failed', cancel: 'Cancelled' }[r] || r
		},
		when(ts) {
			if (!ts) {
				return '—'
			}
			try {
				return new Date(ts * 1000).toLocaleString()
			} catch {
				return '—'
			}
		},
		dur(seconds) {
			return seconds > 0 ? formatPrintTime(seconds) : '—'
		},
		pct(ratio) {
			return ratio == null ? '—' : `${Math.round(ratio * 100)}%`
		},
		etaLabel(ratio) {
			// ratio = actual / slicer. >1 means the print ran longer than estimated.
			if (ratio == null) {
				return '—'
			}
			return `${ratio.toFixed(2)}×`
		},
		async remove(id) {
			await this.printStore.deleteHistoryRecord(id)
		},
		async clearAll() {
			// eslint-disable-next-line no-alert
			if (!window.confirm('Delete all print-history records? This cannot be undone.')) {
				return
			}
			await this.printStore.clearHistory()
			this.loaded = false
		},
	},
}
</script>

<template>
	<div class="nc-print-card nc-print-history">
		<button
			type="button"
			class="nc-print-history__toggle"
			:aria-expanded="open ? 'true' : 'false'"
			@click="toggle">
			<h2 class="nc-print-card__title">Print history &amp; metrics</h2>
			<span class="nc-print-history__chev" aria-hidden="true">{{ open ? '▾' : '▸' }}</span>
		</button>

		<div v-if="open" class="nc-print-history__body">
			<div class="nc-print-history__toolbar">
				<button type="button" class="nc-print-btn nc-print-btn--sm" @click="reload">
					Refresh
				</button>
				<button
					v-if="h.total > 0"
					type="button"
					class="nc-print-btn nc-print-btn--sm nc-print-history__danger"
					@click="clearAll">
					Clear all
				</button>
			</div>

			<!-- Quality metrics summary -->
			<div v-if="metrics && metrics.total > 0" class="nc-print-history__metrics">
				<div class="nc-print-history__metric">
					<span class="nc-print-history__metric-val">{{ metrics.total }}</span>
					<span class="nc-print-history__metric-lbl">Prints</span>
				</div>
				<div class="nc-print-history__metric">
					<span class="nc-print-history__metric-val">{{ pct(metrics.success_rate) }}</span>
					<span class="nc-print-history__metric-lbl">Success</span>
				</div>
				<div class="nc-print-history__metric">
					<span class="nc-print-history__metric-val">{{ etaLabel(metrics.eta_ratio_mean) }}</span>
					<span class="nc-print-history__metric-lbl">ETA accuracy</span>
				</div>
				<div class="nc-print-history__metric">
					<span class="nc-print-history__metric-val">{{ metrics.print_hours }}h</span>
					<span class="nc-print-history__metric-lbl">Print time</span>
				</div>
				<div class="nc-print-history__metric">
					<span class="nc-print-history__metric-val">{{ Math.round(metrics.filament_g) }}g</span>
					<span class="nc-print-history__metric-lbl">Filament</span>
				</div>
			</div>
			<p v-else-if="!h.metricsLoading" class="nc-print-history__empty">
				No print history yet. Completed, failed, and cancelled prints are recorded here automatically.
			</p>

			<!-- Consumable wear (heuristic) -->
			<div v-if="wearPrinters.length" class="nc-print-history__wear">
				<h3 class="nc-print-history__subhead">Consumable wear (estimate)</h3>
				<div v-for="w in wearPrinters" :key="w.printer_id" class="nc-print-history__wear-row">
					<span class="nc-print-history__wear-name">{{ w.printer_id || 'Printer' }}</span>
					<div class="nc-print-history__bar" role="img"
						:aria-label="`Estimated nozzle wear ${w.nozzle_wear_pct} percent`">
						<div class="nc-print-history__bar-fill"
							:class="{ 'is-high': w.nozzle_wear_pct >= 80 }"
							:style="{ width: w.nozzle_wear_pct + '%' }" />
					</div>
					<span class="nc-print-history__wear-pct">{{ w.nozzle_wear_pct }}%</span>
				</div>
				<ul v-if="wearHints.length" class="nc-print-history__hints">
					<li v-for="(hint, i) in wearHints" :key="i">{{ hint }}</li>
				</ul>
				<p class="nc-print-history__disclaimer">{{ h.wear.disclaimer }}</p>
			</div>

			<!-- Filters -->
			<div class="nc-print-history__filters">
				<label class="nc-print-history__filter">
					<span class="nc-print-history__filter-lbl">Result</span>
					<select v-model="h.filters.result" class="nc-print-select" @change="applyFilters">
						<option v-for="o in resultOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
					</select>
				</label>
				<label class="nc-print-history__filter">
					<span class="nc-print-history__filter-lbl">Material</span>
					<input v-model.trim="h.filters.material" type="text" class="nc-print-input"
						placeholder="e.g. PLA" maxlength="64" @change="applyFilters">
				</label>
			</div>

			<!-- History table -->
			<div v-if="h.items.length" class="nc-print-history__table-wrap">
				<table class="nc-print-history__table">
					<thead>
						<tr>
							<th scope="col">When</th>
							<th scope="col">Model</th>
							<th scope="col">Material</th>
							<th scope="col">Result</th>
							<th scope="col">Duration</th>
							<th scope="col">ETA</th>
							<th scope="col">Filament</th>
							<th scope="col" />
						</tr>
					</thead>
					<tbody>
						<tr v-for="row in h.items" :key="row.id">
							<td>{{ when(row.ended_at) }}</td>
							<td class="nc-print-history__model" :title="row.filename">{{ row.filename }}</td>
							<td>{{ row.material || '—' }}</td>
							<td>
								<span class="nc-print-badge" :class="`nc-print-badge--${row.result}`">
									{{ resultLabel(row.result) }}
								</span>
							</td>
							<td>{{ dur(row.duration_s) }}</td>
							<td>{{ etaLabel(row.eta_ratio) }}</td>
							<td>{{ row.filament_g != null ? Math.round(row.filament_g) + 'g' : '—' }}</td>
							<td class="nc-print-history__row-actions">
								<button
									type="button"
									class="nc-print-btn nc-print-btn--sm"
									:aria-label="`Delete history entry ${row.filename}`"
									@click="remove(row.id)">
									Delete
								</button>
							</td>
						</tr>
					</tbody>
				</table>
			</div>
			<p v-else-if="h.loading" class="nc-print-history__empty">Loading history…</p>
		</div>
	</div>
</template>

<style scoped>
.nc-print-history__toggle {
	align-items: center;
	background: none;
	border: none;
	cursor: pointer;
	display: flex;
	gap: var(--nc-gcs-space-sm, 8px);
	justify-content: space-between;
	padding: 0;
	width: 100%;
}

.nc-print-history__chev {
	color: var(--nc-gcs-text-muted);
	font-size: var(--nc-gcs-text-sm);
}

.nc-print-history__body {
	margin-top: var(--nc-gcs-space-md, 12px);
}

.nc-print-history__toolbar {
	display: flex;
	gap: var(--nc-gcs-space-sm, 8px);
	justify-content: flex-end;
	margin-bottom: var(--nc-gcs-space-sm, 8px);
}

.nc-print-history__danger {
	color: var(--color-error, #c33);
}

.nc-print-history__metrics {
	display: grid;
	gap: var(--nc-gcs-space-sm, 8px);
	grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
	margin-bottom: var(--nc-gcs-space-md, 12px);
}

.nc-print-history__metric {
	background: var(--nc-gcs-surface-2, var(--color-background-hover));
	border-radius: var(--nc-gcs-radius, 8px);
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 8px;
	text-align: center;
}

.nc-print-history__metric-val {
	font-size: var(--nc-gcs-text-lg, 1.1rem);
	font-weight: 600;
}

.nc-print-history__metric-lbl {
	color: var(--nc-gcs-text-muted);
	font-size: 12px;
}

.nc-print-history__subhead {
	font-size: var(--nc-gcs-text-sm);
	margin: 0 0 var(--nc-gcs-space-sm, 8px);
}

.nc-print-history__wear {
	margin-bottom: var(--nc-gcs-space-md, 12px);
}

.nc-print-history__wear-row {
	align-items: center;
	display: flex;
	gap: var(--nc-gcs-space-sm, 8px);
	margin-bottom: 4px;
}

.nc-print-history__wear-name {
	flex: 0 0 30%;
	font-size: var(--nc-gcs-text-sm);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.nc-print-history__bar {
	background: var(--color-background-dark, #ddd);
	border-radius: 4px;
	flex: 1;
	height: 8px;
	overflow: hidden;
}

.nc-print-history__bar-fill {
	background: var(--color-success, #2b2);
	height: 100%;
}

.nc-print-history__bar-fill.is-high {
	background: var(--color-error, #c33);
}

.nc-print-history__wear-pct {
	flex: 0 0 auto;
	font-size: 12px;
	min-width: 34px;
	text-align: right;
}

.nc-print-history__hints {
	color: var(--nc-gcs-text-muted);
	font-size: 12px;
	margin: var(--nc-gcs-space-sm, 8px) 0 0;
	padding-left: 18px;
}

.nc-print-history__disclaimer {
	color: var(--nc-gcs-text-muted);
	font-size: 11px;
	font-style: italic;
	margin: 4px 0 0;
}

.nc-print-history__filters {
	display: flex;
	flex-wrap: wrap;
	gap: var(--nc-gcs-space-sm, 8px);
	margin-bottom: var(--nc-gcs-space-sm, 8px);
}

.nc-print-history__filter {
	display: flex;
	flex-direction: column;
	font-size: 12px;
	gap: 2px;
}

.nc-print-history__filter-lbl {
	color: var(--nc-gcs-text-muted);
}

.nc-print-history__empty {
	color: var(--nc-gcs-text-muted);
	font-size: var(--nc-gcs-text-sm);
	margin: var(--nc-gcs-space-sm, 8px) 0;
}

.nc-print-history__table-wrap {
	overflow-x: auto;
}

.nc-print-history__table {
	border-collapse: collapse;
	font-size: var(--nc-gcs-text-sm);
	width: 100%;
}

.nc-print-history__table th,
.nc-print-history__table td {
	border-bottom: 1px solid var(--nc-gcs-border);
	padding: 6px 8px;
	text-align: left;
	vertical-align: middle;
}

.nc-print-history__model {
	max-width: 160px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.nc-print-badge--complete {
	background: var(--color-success, #2b2);
	color: #fff;
}

.nc-print-badge--error {
	background: var(--color-error, #c33);
	color: #fff;
}

.nc-print-badge--cancel {
	background: var(--nc-gcs-text-muted, #888);
	color: #fff;
}

.nc-print-btn--sm {
	font-size: 12px;
	padding: 4px 8px;
}
</style>
