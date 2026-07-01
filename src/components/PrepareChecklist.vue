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
	methods: {
		onRowClick(row) {
			if (row.action) {
				this.$emit('action', row.action)
			}
		},
		rowClass(row) {
			return [
				row.ok ? 'nc-print-checklist__row--ok' : 'nc-print-checklist__row--missing',
				row.action ? 'nc-print-checklist__row--clickable' : '',
			]
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
				:class="rowClass(row)">
				<button
					v-if="row.action"
					type="button"
					class="nc-print-checklist__btn"
					@click="onRowClick(row)">
					<span class="nc-print-checklist__mark" aria-hidden="true">{{ row.ok ? '✓' : '✗' }}</span>
					<span class="nc-print-checklist__label">{{ row.label }}</span>
					<span v-if="!row.ok && row.hint" class="nc-print-checklist__hint">{{ row.hint }}</span>
				</button>
				<template v-else>
					<span class="nc-print-checklist__mark" aria-hidden="true">{{ row.ok ? '✓' : '✗' }}</span>
					<span class="nc-print-checklist__label">{{ row.label }}</span>
					<span v-if="!row.ok && row.hint" class="nc-print-checklist__hint">{{ row.hint }}</span>
				</template>
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
	font-size: var(--nc-gcs-text-sm);
}

.nc-print-checklist__row + .nc-print-checklist__row {
	border-top: 1px solid var(--nc-gcs-border);
}

.nc-print-checklist__btn {
	align-items: baseline;
	appearance: none;
	background: none;
	border: none;
	color: inherit;
	cursor: pointer;
	display: flex;
	flex-wrap: wrap;
	font: inherit;
	gap: 6px 8px;
	padding: 6px 0;
	text-align: left;
	width: 100%;
}

.nc-print-checklist__btn:hover {
	color: var(--nc-app-accent);
}

.nc-print-checklist__btn:focus-visible {
	outline: 2px solid var(--nc-app-accent);
	outline-offset: 2px;
}

.nc-print-checklist__row:not(.nc-print-checklist__row--clickable) {
	align-items: baseline;
	display: flex;
	flex-wrap: wrap;
	gap: 6px 8px;
	padding: 6px 0;
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
