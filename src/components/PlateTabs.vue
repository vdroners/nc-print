<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import NcPrintIcon from './NcPrintIcon.vue'

/**
 * Build-plate switcher strip. Each plate is an independent scene snapshot; the
 * store swaps the live scene on switch and the viewport reloads from model.file.
 * Lightweight — a tab row above the viewport, + / × to add and remove.
 */
export default {
	name: 'PlateTabs',
	components: { NcPrintIcon },
	computed: {
		...mapStores(usePrintStore),
		plates() {
			return this.printStore.plates
		},
		activeId() {
			return this.printStore.activePlateId
		},
	},
	methods: {
		onSelect(id) {
			this.printStore.switchPlate(id)
		},
		onAdd() {
			this.printStore.addPlate()
		},
		onRemove(id) {
			if (this.plates.length <= 1) {
				return
			}
			if (window.confirm('Remove this plate and its objects?')) {
				this.printStore.removePlate(id)
			}
		},
	},
}
</script>

<template>
	<div class="nc-print-plates" role="tablist" aria-label="Build plates">
		<button
			v-for="p in plates"
			:key="p.id"
			type="button"
			class="nc-print-plates__tab"
			:class="{ 'nc-print-plates__tab--active': p.id === activeId }"
			role="tab"
			:aria-selected="p.id === activeId"
			@click="onSelect(p.id)">
			<NcPrintIcon name="grid" :size="14" />
			<span class="nc-print-plates__name">{{ p.name }}</span>
			<span
				v-if="plates.length > 1"
				class="nc-print-plates__close"
				role="button"
				aria-label="Remove plate"
				title="Remove plate"
				@click.stop="onRemove(p.id)">×</span>
		</button>
		<button
			type="button"
			class="nc-print-plates__add"
			title="Add build plate"
			aria-label="Add build plate"
			@click="onAdd">
			+
		</button>
	</div>
</template>

<style scoped>
.nc-print-plates {
	align-items: center;
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
}
.nc-print-plates__tab {
	align-items: center;
	appearance: none;
	background: color-mix(in srgb, var(--nc-gcs-bg-surface, var(--color-main-background)) 82%, transparent);
	border: 1px solid var(--nc-gcs-border);
	border-radius: var(--nc-gcs-radius-sm);
	color: var(--nc-gcs-text-secondary);
	cursor: pointer;
	display: inline-flex;
	font-size: var(--nc-gcs-text-sm);
	gap: 6px;
	padding: 4px 8px;
}
.nc-print-plates__tab--active {
	background: color-mix(in srgb, var(--nc-app-accent) 15%, transparent);
	border-color: var(--nc-app-accent);
	color: var(--nc-gcs-text-primary);
	font-weight: 600;
}
.nc-print-plates__close {
	cursor: pointer;
	font-size: 15px;
	line-height: 1;
	opacity: 0.6;
	padding: 0 2px;
}
.nc-print-plates__close:hover {
	opacity: 1;
}
.nc-print-plates__add {
	appearance: none;
	background: transparent;
	border: 1px dashed var(--nc-gcs-border);
	border-radius: var(--nc-gcs-radius-sm);
	color: var(--nc-gcs-text-secondary);
	cursor: pointer;
	font-size: 16px;
	line-height: 1;
	padding: 4px 10px;
}
.nc-print-plates__add:hover {
	border-color: var(--nc-app-accent);
	color: var(--nc-app-accent);
}
</style>
