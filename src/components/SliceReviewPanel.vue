<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { diffOverrides, mergeProfileSettings } from '@/services/slicer-utils.js'

export default {
	name: 'SliceReviewPanel',
	computed: {
		...mapStores(usePrintStore),
		profileDefaults() {
			return mergeProfileSettings(this.printStore.profiles, this.printStore.selection)
		},
		diffRows() {
			return diffOverrides(this.printStore.overrides, this.profileDefaults)
		},
		hasDiff() {
			return this.diffRows.length > 0
		},
	},
}
</script>

<template>
	<div v-if="printStore.hasModel" class="nc-print-card nc-print-slice-review">
		<h2 class="nc-print-card__title">Settings review</h2>
		<p class="nc-print-slice-review__hint">
			Compare your overrides to the merged profile defaults before slicing.
		</p>
		<table v-if="hasDiff" class="nc-print-slice-review__table">
			<thead>
				<tr>
					<th scope="col">Setting</th>
					<th scope="col">Profile default</th>
					<th scope="col">Your override</th>
				</tr>
			</thead>
			<tbody>
				<tr v-for="row in diffRows" :key="row.key">
					<td>{{ row.label }}</td>
					<td class="nc-print-slice-review__default">{{ row.defaultValue || '—' }}</td>
					<td class="nc-print-slice-review__override">{{ row.overrideValue }}</td>
				</tr>
			</tbody>
		</table>
		<p v-else class="nc-print-slice-review__none">
			No overrides — slicing will use profile defaults.
		</p>
	</div>
</template>

<style scoped>
.nc-print-slice-review__hint {
	color: var(--nc-gcs-text-muted);
	font-size: var(--nc-gcs-text-sm);
	margin: 0 0 var(--nc-gcs-space-sm);
}

.nc-print-slice-review__table {
	border-collapse: collapse;
	font-size: var(--nc-gcs-text-sm);
	width: 100%;
}

.nc-print-slice-review__table th,
.nc-print-slice-review__table td {
	border-bottom: 1px solid var(--nc-gcs-border);
	padding: 6px 8px;
	text-align: left;
}

.nc-print-slice-review__default {
	color: var(--nc-gcs-text-muted);
}

.nc-print-slice-review__override {
	color: var(--nc-app-accent);
	font-weight: 600;
}

.nc-print-slice-review__none {
	color: var(--nc-gcs-text-muted);
	font-size: var(--nc-gcs-text-sm);
	margin: 0;
}
</style>
