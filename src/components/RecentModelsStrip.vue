<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'

export default {
	name: 'RecentModelsStrip',
	computed: {
		...mapStores(usePrintStore),
		items() {
			return this.printStore.recentModels.slice(0, 5)
		},
	},
	methods: {
		onSelect(entry) {
			this.$emit('select', entry)
		},
		formatSize(bytes) {
			if (!bytes) {
				return ''
			}
			const kb = Math.round(bytes / 1024)
			return kb < 1024 ? `${kb} KB` : `${(kb / 1024).toFixed(1)} MB`
		},
	},
}
</script>

<template>
	<div v-if="items.length" class="nc-print-recent-strip">
		<span class="nc-print-recent-strip__label">Recent</span>
		<div class="nc-print-recent-strip__scroll">
			<button
				v-for="entry in items"
				:key="entry.key"
				type="button"
				class="nc-print-recent-strip__chip"
				:title="entry.name"
				@click="onSelect(entry)">
				<span class="nc-print-recent-strip__name">{{ entry.name }}</span>
				<span class="nc-print-recent-strip__meta">{{ formatSize(entry.size) }}</span>
			</button>
		</div>
	</div>
</template>

<style scoped>
.nc-print-recent-strip {
	align-items: center;
	display: flex;
	gap: var(--nc-gcs-space-sm);
	margin-bottom: var(--nc-gcs-space-sm);
	min-width: 0;
}

.nc-print-recent-strip__label {
	color: var(--nc-gcs-text-muted);
	flex: 0 0 auto;
	font-size: 11px;
	font-weight: 600;
	text-transform: uppercase;
}

.nc-print-recent-strip__scroll {
	display: flex;
	flex: 1 1 auto;
	gap: 6px;
	min-width: 0;
	overflow-x: auto;
	padding-bottom: 2px;
}

.nc-print-recent-strip__chip {
	appearance: none;
	background: var(--nc-gcs-bg-elevated, rgba(255, 255, 255, 0.04));
	border: 1px solid var(--nc-gcs-border);
	border-radius: var(--nc-gcs-radius-sm);
	cursor: pointer;
	display: flex;
	flex: 0 0 auto;
	flex-direction: column;
	font: inherit;
	max-width: 160px;
	padding: 6px 10px;
	text-align: left;
}

.nc-print-recent-strip__chip:hover {
	border-color: var(--nc-app-accent);
}

.nc-print-recent-strip__name {
	font-size: var(--nc-gcs-text-sm);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.nc-print-recent-strip__meta {
	color: var(--nc-gcs-text-muted);
	font-size: 10px;
	margin-top: 2px;
}
</style>
