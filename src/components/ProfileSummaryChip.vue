<script>
import { mapStores } from 'pinia'
import { usePrintStore, TABS } from '@/store/print.js'

export default {
	name: 'ProfileSummaryChip',
	computed: {
		...mapStores(usePrintStore),
		summary() {
			const n = this.printStore.selectedProfileNames
			return `${n.printer} · ${n.filament} · ${n.process}`
		},
	},
	methods: {
		editProfiles() {
			this.printStore.setActiveTab(TABS.PREPARE)
		},
	},
}
</script>

<template>
	<div class="nc-print-profile-chip">
		<span class="nc-print-profile-chip__text">{{ summary }}</span>
		<button type="button" class="nc-print-link-btn" @click="editProfiles">
			Change on Prepare
		</button>
	</div>
</template>

<style scoped>
.nc-print-profile-chip {
	align-items: center;
	display: flex;
	flex-wrap: wrap;
	font-size: var(--nc-gcs-text-sm);
	gap: 8px;
}

.nc-print-profile-chip__text {
	color: var(--nc-gcs-text-muted);
}

.nc-print-link-btn {
	appearance: none;
	background: none;
	border: none;
	color: var(--nc-app-accent);
	cursor: pointer;
	font: inherit;
	text-decoration: underline;
}
</style>
