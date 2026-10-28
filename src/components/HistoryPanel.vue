<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { moonrakerGet } from '@/services/moonraker-api.js'
import { formatPrintTime } from '@/services/slicer-utils.js'
import NcPrintIcon from './NcPrintIcon.vue'
import {
	parseHistoryTotals,
	parseHistoryList,
	historyStatusBreakdown,
	historyStatusLabel,
	historyStatusTone,
} from '@/utils/history.js'

export default {
	name: 'HistoryPanel',
	components: { NcPrintIcon },
	data() {
		return {
			totals: null,
			jobs: [],
			loadError: '',
			loading: false,
		}
	},
	computed: {
		...mapStores(usePrintStore),
		printerId() {
			return this.printStore.selectedPrinterId || undefined
		},
		supported() {
			return this.printStore.hasFeature('history')
		},
		breakdown() {
			return historyStatusBreakdown(this.jobs)
		},
		lifetimeTime() {
			return this.totals ? formatPrintTime(this.totals.printTimeS) : '—'
		},
		lifetimeFilament() {
			if (!this.totals) {
				return '—'
			}
			return `${(this.totals.filamentMm / 1000).toFixed(1)} m`
		},
		successLabel() {
			if (this.breakdown.total === 0) {
				return '—'
			}
			return `${Math.round(this.breakdown.successRate * 100)}%`
		},
	},
	mounted() {
		if (this.supported) {
			void this.load()
		}
	},
	methods: {
		// Expose the util to the template (templates can't see module imports).
		formatPrintTime,
		async load() {
			this.loading = true
			try {
				const [totalsRes, listRes] = await Promise.all([
					moonrakerGet('server/history/totals', {}, this.printerId),
					moonrakerGet('server/history/list', { limit: 20, order: 'desc' }, this.printerId),
				])
				this.totals = parseHistoryTotals(totalsRes)
				this.jobs = parseHistoryList(listRes)
				this.loadError = ''
			} catch (e) {
				this.loadError = e?.message || 'History unavailable'
			} finally {
				this.loading = false
			}
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
		statusLabel(status) {
			return historyStatusLabel(status)
		},
		statusClass(status) {
			return `nc-print-history-badge--${historyStatusTone(status)}`
		},
	},
}
</script>

<template>
	<div v-if="supported" class="nc-print-card nc-print-history">
		<div class="nc-print-card__header">
			<h2 class="nc-print-card__title">
				<span class="nc-print-card__title-row">
					<NcPrintIcon name="clock" :size="18" />
					Print history
				</span>
			</h2>
			<button type="button" class="nc-print-btn nc-print-btn--sm" :disabled="loading" @click="load">
				Refresh
			</button>
		</div>

		<p v-if="loadError" class="nc-print-history__error">{{ loadError }}</p>

		<template v-else>
			<dl class="nc-print-history__totals">
				<div>
					<dt>Lifetime print time</dt>
					<dd>{{ lifetimeTime }}</dd>
				</div>
				<div>
					<dt>Filament used</dt>
					<dd>{{ lifetimeFilament }}</dd>
				</div>
				<div>
					<dt>Jobs</dt>
					<dd>{{ totals ? totals.jobs : '—' }}</dd>
				</div>
				<div>
					<dt>Success rate</dt>
					<dd>{{ successLabel }}</dd>
				</div>
			</dl>

			<div v-if="jobs.length" class="nc-print-history__table-wrap">
				<table class="nc-print-history__table">
					<thead>
						<tr>
							<th scope="col">Job</th>
							<th scope="col">When</th>
							<th scope="col">Time</th>
							<th scope="col">Status</th>
						</tr>
					</thead>
					<tbody>
						<tr v-for="job in jobs" :key="job.jobId || job.filename + job.startTime">
							<td class="nc-print-history__name">{{ job.filename }}</td>
							<td>{{ when(job.startTime) }}</td>
							<td>{{ job.printDurationS ? formatPrintTime(job.printDurationS) : '—' }}</td>
							<td>
								<span class="nc-print-history-badge" :class="statusClass(job.status)">{{ statusLabel(job.status) }}</span>
							</td>
						</tr>
					</tbody>
				</table>
			</div>
			<p v-else class="nc-print-history__empty">No print history yet.</p>
		</template>
	</div>
</template>

<style scoped>
.nc-print-history__totals {
	display: grid;
	gap: 8px;
	grid-template-columns: repeat(2, 1fr);
	margin: 0 0 12px;
}

.nc-print-history__totals dt {
	color: var(--nc-gcs-text-muted);
	font-size: var(--nc-gcs-text-xs, 11px);
}

.nc-print-history__totals dd {
	font-size: var(--nc-gcs-text-md, 15px);
	font-weight: 600;
	margin: 0;
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
}

.nc-print-history__name {
	max-width: 160px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.nc-print-history__error,
.nc-print-history__empty {
	color: var(--nc-gcs-text-muted);
	font-size: var(--nc-gcs-text-sm);
}

.nc-print-history-badge {
	border-radius: 10px;
	display: inline-block;
	font-size: 11px;
	font-weight: 600;
	line-height: 1.3;
	padding: 2px 8px;
	white-space: nowrap;
}

.nc-print-history-badge--ok {
	background: var(--nc-gcs-success-tint, rgba(76, 175, 80, 0.22));
	color: var(--nc-gcs-success, #4caf50);
}

.nc-print-history-badge--info {
	background: color-mix(in srgb, var(--nc-gcs-info, #00bcd4) 22%, transparent);
	color: var(--nc-gcs-info-soft, #22d3ee);
}

.nc-print-history-badge--warn {
	background: var(--nc-gcs-warning-tint, rgba(255, 152, 0, 0.22));
	color: var(--nc-gcs-warning, #ff9800);
}

.nc-print-history-badge--danger {
	background: var(--nc-gcs-danger-tint, rgba(244, 67, 54, 0.22));
	color: var(--nc-gcs-danger-soft, #ef4444);
}

.nc-print-history-badge--muted {
	background: color-mix(in srgb, var(--nc-gcs-text-muted) 22%, transparent);
	color: var(--nc-gcs-text-primary);
}
</style>
