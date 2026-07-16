<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'

/**
 * Consolidated slice-warnings surface (v1.67). Shows the store's `sliceWarnings`
 * getter — out-of-bed objects, mesh-health issues, and adapter slice-time
 * warnings — as a single list. A row tied to an object jumps to (selects) it so
 * the user can fix it. Self-hides when there are no warnings.
 */
export default {
	name: 'SliceWarningsPanel',
	computed: {
		...mapStores(usePrintStore),
		warnings() {
			return this.printStore.sliceWarnings
		},
		errorCount() {
			return this.warnings.filter((w) => w.severity === 'error').length
		},
	},
	methods: {
		jumpTo(w) {
			if (w.objectId) {
				this.printStore.selectObject(w.objectId)
			}
		},
	},
}
</script>

<template>
	<div v-if="warnings.length" class="nc-print-warnings" :class="{ 'has-error': errorCount }">
		<h3 class="nc-print-warnings__title">
			<span class="nc-print-warnings__icon">⚠</span>
			{{ warnings.length }} {{ warnings.length === 1 ? 'warning' : 'warnings' }}
		</h3>
		<ul class="nc-print-warnings__list">
			<li
				v-for="w in warnings"
				:key="w.id"
				class="nc-print-warnings__row"
				:class="[`is-${w.severity}`, { 'is-clickable': !!w.objectId }]"
				@click="jumpTo(w)">
				<span class="nc-print-warnings__msg">{{ w.message }}</span>
				<span v-if="w.hint" class="nc-print-warnings__hint">{{ w.hint }}</span>
				<span v-if="w.objectId" class="nc-print-warnings__jump">Select →</span>
			</li>
		</ul>
	</div>
</template>

<style scoped>
.nc-print-warnings {
	background: var(--nc-gcs-bg-elevated, var(--color-main-background));
	border: 1px solid var(--color-warning, #e0a800);
	border-radius: var(--nc-gcs-radius-sm, 6px);
	padding: var(--nc-gcs-space-sm) var(--nc-gcs-space-md);
}

.nc-print-warnings.has-error {
	border-color: var(--color-error, #c33);
}

.nc-print-warnings__title {
	align-items: center;
	color: var(--color-warning, #e0a800);
	display: flex;
	font-size: var(--nc-gcs-text-sm);
	font-weight: 700;
	gap: 6px;
	margin: 0 0 var(--nc-gcs-space-sm);
}

.nc-print-warnings.has-error .nc-print-warnings__title {
	color: var(--color-error, #c33);
}

.nc-print-warnings__list {
	display: flex;
	flex-direction: column;
	gap: 6px;
	list-style: none;
	margin: 0;
	padding: 0;
}

.nc-print-warnings__row {
	border-left: 3px solid var(--color-warning, #e0a800);
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 4px 8px;
}

.nc-print-warnings__row.is-error {
	border-left-color: var(--color-error, #c33);
}

.nc-print-warnings__row.is-clickable {
	cursor: pointer;
}

.nc-print-warnings__row.is-clickable:hover {
	background: var(--color-background-hover);
}

.nc-print-warnings__msg {
	font-size: var(--nc-gcs-text-sm);
}

.nc-print-warnings__hint {
	color: var(--nc-gcs-text-muted);
	font-size: 0.78rem;
}

.nc-print-warnings__jump {
	color: var(--nc-app-accent, var(--color-primary-element));
	font-size: 0.72rem;
	font-weight: 700;
}
</style>
