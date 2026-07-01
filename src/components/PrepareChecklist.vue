<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'

export default {
	name: 'PrepareChecklist',
	computed: {
		...mapStores(usePrintStore),
		items() {
			return this.printStore.prepareChecklist
		},
	},
}
</script>

<template>
	<div class="nc-print-card nc-print-checklist">
		<h2 class="nc-print-card__title">Ready to slice</h2>
		<ul class="nc-print-checklist__list">
			<li
				v-for="row in items"
				:key="row.id"
				class="nc-print-checklist__row"
				:class="row.ok ? 'nc-print-checklist__row--ok' : 'nc-print-checklist__row--missing'">
				<span class="nc-print-checklist__mark" aria-hidden="true">{{ row.ok ? '✓' : '✗' }}</span>
				<span class="nc-print-checklist__label">{{ row.label }}</span>
				<span v-if="!row.ok && row.hint" class="nc-print-checklist__hint">{{ row.hint }}</span>
			</li>
		</ul>
	</div>
</template>

<style scoped>
.nc-print-checklist__list {
	list-style: none;
	margin: 0;
	padding: 0;
}

.nc-print-checklist__row {
	align-items: baseline;
	display: flex;
	flex-wrap: wrap;
	font-size: var(--nc-gcs-text-sm);
	gap: 6px 8px;
	padding: 6px 0;
}

.nc-print-checklist__row + .nc-print-checklist__row {
	border-top: 1px solid var(--nc-gcs-border);
}

.nc-print-checklist__mark {
	font-weight: 700;
	width: 1.2em;
}

.nc-print-checklist__row--ok .nc-print-checklist__mark {
	color: var(--nc-app-accent);
}

.nc-print-checklist__row--missing .nc-print-checklist__mark {
	color: var(--nc-gcs-danger-soft);
}

.nc-print-checklist__hint {
	color: var(--nc-gcs-text-muted);
	flex: 1 1 100%;
	padding-left: 1.8em;
}
</style>
