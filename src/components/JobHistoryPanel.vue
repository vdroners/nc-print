<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { formatPrintTime } from '@/services/slicer-utils.js'

export default {
	name: 'JobHistoryPanel',
	props: {
		/** Compact mode: fewer columns/hints, capped rows (Print monitor). */
		compact: { type: Boolean, default: false },
		/** Max rows to show (0 = all). */
		limit: { type: Number, default: 0 },
	},
	computed: {
		...mapStores(usePrintStore),
		rows() {
			const all = this.printStore.jobHistory
			return this.limit > 0 ? all.slice(0, this.limit) : all
		},
	},
	methods: {
		formatTime(ts) {
			if (!ts) {
				return '—'
			}
			try {
				return new Date(ts).toLocaleString()
			} catch {
				return '—'
			}
		},
		printTime(row) {
			return formatPrintTime(row.estimatedTimeS)
		},
		sliceAgain(row) {
			void this.printStore.replayJobSlice(row)
		},
		printAgain(row) {
			void this.printStore.replayJobPrint(row)
		},
	},
}
</script>

<template>
	<div v-if="rows.length" class="nc-print-card nc-print-job-history">
		<h2 class="nc-print-card__title">Recent jobs</h2>
		<template v-if="!compact">
			<p class="nc-print-job-history__hint">
				Last {{ rows.length }} slice jobs on this browser (local only).
			</p>
			<p class="nc-print-job-history__hint nc-print-job-history__hint--sub">
				Restore settings reloads profiles and overrides from a past job — click <strong>Slice only</strong> or <strong>Slice and send</strong> to run again.
			</p>
		</template>
		<div class="nc-print-job-history__table-wrap">
			<table class="nc-print-job-history__table">
				<thead>
					<tr>
						<th scope="col">Model</th>
						<th scope="col">When</th>
						<th scope="col">Est.</th>
						<th scope="col" />
					</tr>
				</thead>
				<tbody>
					<tr v-for="row in rows" :key="row.id">
						<td class="nc-print-job-history__model">{{ row.modelName }}</td>
						<td>{{ formatTime(row.timestamp) }}</td>
						<td>{{ printTime(row) }}</td>
						<td class="nc-print-job-history__actions">
							<button
								type="button"
								class="nc-print-btn nc-print-btn--sm"
								@click="sliceAgain(row)">
								Restore settings
							</button>
							<button
								v-if="row.hasGcode"
								type="button"
								class="nc-print-btn nc-print-btn--sm"
								@click="printAgain(row)">
								Print again
							</button>
						</td>
					</tr>
				</tbody>
			</table>
		</div>
	</div>
</template>

<style scoped>
.nc-print-job-history__hint {
	color: var(--nc-gcs-text-muted);
	font-size: var(--nc-gcs-text-sm);
	margin: 0 0 var(--nc-gcs-space-sm);
}

.nc-print-job-history__hint--sub {
	margin-top: calc(-1 * var(--nc-gcs-space-xs, 4px));
}

.nc-print-job-history__table-wrap {
	overflow-x: auto;
}

.nc-print-job-history__table {
	border-collapse: collapse;
	font-size: var(--nc-gcs-text-sm);
	width: 100%;
}

.nc-print-job-history__table th,
.nc-print-job-history__table td {
	border-bottom: 1px solid var(--nc-gcs-border);
	padding: 8px;
	text-align: left;
	vertical-align: middle;
}

.nc-print-job-history__model {
	font-weight: 500;
	max-width: 140px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.nc-print-job-history__actions {
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
	white-space: nowrap;
}

.nc-print-btn--sm {
	font-size: 12px;
	padding: 4px 8px;
}
</style>
