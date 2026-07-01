<script>
import { mapStores } from 'pinia'
import { usePrintStore, TABS } from '@/store/print.js'
import PrintAppShell from './components/PrintAppShell.vue'
import PrepareTab from './components/PrepareTab.vue'
import SliceTab from './components/SliceTab.vue'
import PrintTab from './components/PrintTab.vue'
import HelpDrawer from './components/HelpDrawer.vue'

const TAB_LABELS = {
	[TABS.PREPARE]: 'Prepare',
	[TABS.SLICE]: 'Slice',
	[TABS.PRINT]: 'Print',
}

export default {
	name: 'App',
	components: {
		PrintAppShell,
		PrepareTab,
		SliceTab,
		PrintTab,
		HelpDrawer,
	},
	data() {
		return {
			helpOpen: false,
			TABS,
			TAB_LABELS,
			version: typeof __NC_PRINT_FRONTEND_VERSION__ !== 'undefined'
				? __NC_PRINT_FRONTEND_VERSION__
				: '1.0.0',
		}
	},
	computed: {
		...mapStores(usePrintStore),
	},
	async created() {
		await this.printStore.loadConfig()
		await this.printStore.loadProfiles()
		this.printStore.startPrinterPolling()
	},
	beforeDestroy() {
		this.printStore.stopPrinterPolling()
	},
	methods: {
		setTab(tab) {
			this.printStore.setActiveTab(tab)
		},
		openHelp() {
			this.helpOpen = true
		},
	},
}
</script>

<template>
	<PrintAppShell
		app-id="nc_print"
		title="NC Print"
		subtitle="Prepare · Slice · Print"
		accent="#22c55e">
		<template #banner-extra>
			<span
				class="nc-print-status-chip"
				:class="'nc-print-status-chip--' + printStore.printerStatusClass">
				{{ printStore.printerStatusLabel }}
			</span>
			<button
				type="button"
				class="nc-print-btn nc-print-help-btn"
				aria-label="Help"
				@click="openHelp">
				Help
			</button>
		</template>

		<nav class="nc-print-tabs" role="tablist" aria-label="Workflow">
			<button
				v-for="tab in [TABS.PREPARE, TABS.SLICE, TABS.PRINT]"
				:key="tab"
				type="button"
				role="tab"
				class="nc-print-tabs__btn"
				:class="{ 'nc-print-tabs__btn--active': printStore.activeTab === tab }"
				:aria-selected="printStore.activeTab === tab"
				@click="setTab(tab)">
				{{ TAB_LABELS[tab] }}
			</button>
		</nav>

		<PrepareTab v-show="printStore.activeTab === TABS.PREPARE" />
		<SliceTab v-show="printStore.activeTab === TABS.SLICE" />
		<PrintTab v-show="printStore.activeTab === TABS.PRINT" />

		<HelpDrawer :open.sync="helpOpen" />

		<template #footer>
			NC Print v{{ version }} · Moonraker + Forge Slicer
		</template>
	</PrintAppShell>
</template>
