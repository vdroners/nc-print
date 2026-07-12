<script>
import { fetchAnalytics } from '@/services/history-api.js'

/**
 * Overview analytics dashboard — totals, weekly trend, per-material and
 * per-printer rollups over the user's durable print history. Read-only.
 */
export default {
	name: 'AnalyticsPanel',
	data() {
		return {
			overall: null,
			byMaterial: [],
			byPrinter: [],
			weekly: [],
			cost: null,
			loading: true,
			loadError: '',
		}
	},
	computed: {
		successPct() {
			if (!this.overall || this.overall.success_rate === null) {
				return null
			}
			return Math.round(this.overall.success_rate * 100)
		},
		maxWeekPrints() {
			return this.weekly.reduce((m, w) => Math.max(m, w.prints || 0), 0) || 1
		},
		maxMaterial() {
			return this.byMaterial.reduce((m, x) => Math.max(m, x.count || 0), 0) || 1
		},
	},
	async mounted() {
		await this.reload()
	},
	methods: {
		async reload() {
			this.loading = true
			this.loadError = ''
			try {
				const d = await fetchAnalytics()
				this.overall = d.overall || null
				this.byMaterial = Array.isArray(d.by_material) ? d.by_material : []
				this.byPrinter = Array.isArray(d.by_printer) ? d.by_printer : []
				this.weekly = Array.isArray(d.weekly) ? d.weekly : []
				this.cost = d.cost || null
			} catch (e) {
				this.loadError = 'Could not load analytics'
			} finally {
				this.loading = false
			}
		},
		weekLabel(w) {
			const d = new Date((w.week_start || 0) * 1000)
			return `${d.getMonth() + 1}/${d.getDate()}`
		},
		barPct(prints) {
			return Math.round((prints / this.maxWeekPrints) * 100)
		},
		matPct(count) {
			return Math.round((count / this.maxMaterial) * 100)
		},
	},
}
</script>

<template>
	<div class="an">
		<h3 class="an__title">Analytics</h3>

		<p v-if="loadError" class="an__error">{{ loadError }}</p>
		<p v-else-if="loading" class="an__hint">Loading analytics…</p>

		<template v-else-if="overall && overall.total">
			<!-- Summary tiles -->
			<div class="nc-print-stat-grid">
				<div class="nc-print-stat">
					<span class="nc-print-stat__value">{{ overall.total }}</span>
					<span class="nc-print-stat__label">Prints</span>
				</div>
				<div class="nc-print-stat">
					<span class="nc-print-stat__value">{{ successPct !== null ? successPct + '%' : '—' }}</span>
					<span class="nc-print-stat__label">Success</span>
				</div>
				<div class="nc-print-stat">
					<span class="nc-print-stat__value">{{ (overall.filament_g / 1000).toFixed(2) }}kg</span>
					<span class="nc-print-stat__label">Filament</span>
				</div>
				<div class="nc-print-stat">
					<span class="nc-print-stat__value">{{ Math.round(overall.print_hours) }}h</span>
					<span class="nc-print-stat__label">Print time</span>
				</div>
				<div v-if="cost" class="nc-print-stat">
					<span class="nc-print-stat__value">~{{ cost.estimated_total }}</span>
					<span class="nc-print-stat__label">Est. cost ({{ cost.price_per_kg }}/kg)</span>
				</div>
			</div>

			<!-- Weekly trend -->
			<div v-if="weekly.length" class="an__section">
				<p class="nc-print-section-label">Prints per week</p>
				<div class="an__bars">
					<div v-for="w in weekly" :key="w.week_start" class="an__bar-col" :title="`${w.prints} prints, ${w.filament_g}g`">
						<div class="an__bar" :style="{ height: barPct(w.prints) + '%' }" />
						<span class="an__bar-label">{{ weekLabel(w) }}</span>
					</div>
				</div>
			</div>

			<!-- Per material -->
			<div v-if="byMaterial.length" class="an__section">
				<p class="nc-print-section-label">By material</p>
				<div v-for="m in byMaterial" :key="m.material" class="an__row">
					<span class="an__row-label">{{ m.material }}</span>
					<div class="an__row-bar"><div class="an__row-fill" :style="{ width: matPct(m.count) + '%' }" /></div>
					<span class="an__row-val">{{ m.count }}</span>
				</div>
			</div>

			<!-- Per printer -->
			<div v-if="byPrinter.length" class="an__section">
				<p class="nc-print-section-label">By printer</p>
				<table class="an__table">
					<thead>
						<tr><th>Printer</th><th>Prints</th><th>Success</th><th>Filament</th></tr>
					</thead>
					<tbody>
						<tr v-for="p in byPrinter" :key="p.printer_id">
							<td>{{ p.printer_id || 'unknown' }}</td>
							<td>{{ p.total }}</td>
							<td>{{ p.success_rate !== null ? Math.round(p.success_rate * 100) + '%' : '—' }}</td>
							<td>{{ (p.filament_g / 1000).toFixed(2) }}kg</td>
						</tr>
					</tbody>
				</table>
			</div>
		</template>

		<p v-else class="an__hint">No print history yet — complete a print to see analytics.</p>
	</div>
</template>

<style scoped>
.an__title {
	font-size: var(--nc-gcs-text-base);
	font-weight: 600;
	margin: 0 0 var(--nc-gcs-space-sm);
}
.an__hint {
	color: var(--nc-gcs-text-muted);
	font-size: var(--nc-gcs-text-sm);
	margin: 0;
}
.an__error {
	color: var(--nc-gcs-danger-soft);
	font-size: var(--nc-gcs-text-sm);
	margin: 0;
}
.an__section {
	margin-top: var(--nc-gcs-space-md);
}
.an__bars {
	align-items: flex-end;
	display: flex;
	gap: 3px;
	height: 90px;
}
.an__bar-col {
	display: flex;
	flex: 1 1 0;
	flex-direction: column;
	align-items: center;
	height: 100%;
	justify-content: flex-end;
	min-width: 0;
}
.an__bar {
	width: 100%;
	min-height: 2px;
	background: var(--nc-app-accent);
	border-radius: 2px 2px 0 0;
}
.an__bar-label {
	color: var(--nc-gcs-text-muted);
	font-size: 9px;
	margin-top: 2px;
	white-space: nowrap;
}
.an__row {
	align-items: center;
	display: flex;
	gap: var(--nc-gcs-space-sm);
	margin-bottom: 4px;
}
.an__row-label {
	flex: 0 0 88px;
	font-size: var(--nc-gcs-text-sm);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.an__row-bar {
	flex: 1 1 auto;
	height: 8px;
	border-radius: 4px;
	background: var(--nc-gcs-border);
	overflow: hidden;
}
.an__row-fill {
	height: 100%;
	background: var(--nc-app-accent);
}
.an__row-val {
	flex: 0 0 auto;
	font-size: var(--nc-gcs-text-sm);
	font-variant-numeric: tabular-nums;
}
.an__table {
	border-collapse: collapse;
	font-size: var(--nc-gcs-text-sm);
	width: 100%;
}
.an__table th,
.an__table td {
	border-bottom: 1px solid var(--nc-gcs-border);
	padding: 4px 6px;
	text-align: left;
}
.an__table th {
	color: var(--nc-gcs-text-muted);
	font-weight: 600;
}
</style>
