<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { TABS } from '@/constants/tabs.js'
import { saveCollapsibleState } from '@/utils/collapsible.js'

/**
 * Name + status for the active send-to printer. Prepare and Print use this
 * instead of the fleet Scan / IP picker, which stays on Overview.
 */
export default {
	name: 'PrinterConnectionStatus',
	computed: {
		...mapStores(usePrintStore),
		label() {
			return this.printStore.targetConnectionLabel || 'No printer selected'
		},
		connectionClass() {
			return this.printStore.targetConnectionClass
		},
	},
	methods: {
		openFleet() {
			saveCollapsibleState('overview-printers', true)
			this.printStore.setActiveTab(TABS.OVERVIEW)
		},
	},
}
</script>

<template>
	<div class="nc-print-printer-status">
		<p class="nc-print-printer-status__line" :class="connectionClass" role="status">
			{{ label }}
		</p>
		<button type="button" class="nc-print-printer-status__change" @click="openFleet">
			Change in Overview
		</button>
	</div>
</template>

<style scoped>
.nc-print-printer-status {
	margin-bottom: var(--nc-gcs-space-sm);
}

.nc-print-printer-status__line {
	margin: 0;
	font-size: 0.85rem;
}

.nc-print-printer-status__line.is-online {
	color: var(--color-success, #4caf50);
}

.nc-print-printer-status__line.is-reconnecting,
.nc-print-printer-status__line.is-link-lost,
.nc-print-printer-status__line.is-error {
	color: var(--nc-gcs-warning, var(--color-warning, #eab308));
}

.nc-print-printer-status__line.is-offline {
	color: var(--color-text-maxcontrast, #8b949e);
}

.nc-print-printer-status__change {
	appearance: none;
	background: none;
	border: none;
	color: var(--nc-app-accent);
	cursor: pointer;
	font: inherit;
	font-size: 0.76rem;
	margin-top: 4px;
	padding: 0;
	text-decoration: underline;
}

.nc-print-printer-status__change:focus-visible {
	outline: 2px solid var(--nc-app-accent);
	outline-offset: 2px;
}
</style>
