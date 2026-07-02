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
		statusClass(status) {
			const s = String(status).toLowerCase()
			if (s === 'completed') {
				return 'nc-print-badge--ok'
			}
			if (s === 'in_progress' || s === 'printing') {
				return 'nc-print-badge--info'
			}
			return 'nc-print-badge--warn'
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
								<span class="nc-print-badge" :class="statusClass(job.status)">{{ job.status }}</span>
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
</style>
