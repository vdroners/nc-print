<script>
import { mapStores } from 'pinia'
import { usePrintStore, TABS } from '@/store/print.js'
import PrintAppShell from './components/PrintAppShell.vue'
import ServiceHealthBanner from './components/ServiceHealthBanner.vue'
import JobSummaryStrip from './components/JobSummaryStrip.vue'
import WorkflowStepper from './components/WorkflowStepper.vue'
import HelpDrawer from './components/HelpDrawer.vue'

const TAB_LABELS = {
	[TABS.PREPARE]: 'Prepare',
	[TABS.SLICE]: 'Slice',
	[TABS.PRINT]: 'Print',
}

const PrepareTab = () => import(/* webpackChunkName: "nc-print-prepare" */ './components/PrepareTab.vue')
const SliceTab = () => import(/* webpackChunkName: "nc-print-slice" */ './components/SliceTab.vue')
const PrintTab = () => import(/* webpackChunkName: "nc-print-print" */ './components/PrintTab.vue')

export default {
	name: 'App',
	components: {
		PrintAppShell,
		ServiceHealthBanner,
		JobSummaryStrip,
		WorkflowStepper,
		HelpDrawer,
		PrepareTab,
		SliceTab,
		PrintTab,
	},
	data() {
		return {
			helpOpen: false,
			TABS,
			TAB_LABELS,
			version: typeof __NC_PRINT_FRONTEND_VERSION__ !== 'undefined'
				? __NC_PRINT_FRONTEND_VERSION__
				: '1.2.0',
		}
	},
	computed: {
		...mapStores(usePrintStore),
		tabPanelId() {
			return `nc-print-panel-${this.printStore.activeTab}`
		},
	},
	async created() {
		const root = document.getElementById('nc-print-root')
		if (root?.dataset?.bootstrap) {
			try {
				this.printStore.setBootstrap(JSON.parse(root.dataset.bootstrap))
			} catch {
				// ignore
			}
		}
		await this.printStore.loadConfig()
		await this.printStore.loadProfiles()
		await this.printStore.loadAppStatus()
		this.printStore.startStatusPolling()
		this.printStore.startPrinterPolling()
		await this.printStore.bootstrapDeepLink()
	},
	beforeDestroy() {
		this.printStore.stopPrinterPolling()
		this.printStore.stopStatusPolling()
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
		title="NC 3D Print"
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

		<WorkflowStepper />

		<nav class="nc-print-tabs" role="tablist" aria-label="Workflow">
			<button
				v-for="tab in [TABS.PREPARE, TABS.SLICE, TABS.PRINT]"
				:id="'nc-print-tab-' + tab"
				:key="tab"
				type="button"
				role="tab"
				class="nc-print-tabs__btn"
				:class="{ 'nc-print-tabs__btn--active': printStore.activeTab === tab }"
				:aria-selected="printStore.activeTab === tab"
				:aria-controls="tabPanelId"
				@click="setTab(tab)">
				{{ TAB_LABELS[tab] }}
			</button>
		</nav>

		<ServiceHealthBanner />
		<JobSummaryStrip />

		<div
			:id="tabPanelId"
			role="tabpanel"
			:aria-labelledby="'nc-print-tab-' + printStore.activeTab">
			<PrepareTab v-if="printStore.activeTab === TABS.PREPARE" />
			<SliceTab v-if="printStore.activeTab === TABS.SLICE" />
			<PrintTab v-if="printStore.activeTab === TABS.PRINT" />
		</div>

		<HelpDrawer :open.sync="helpOpen" />

		<template #footer>
			NC 3D Print v{{ version }} · Moonraker + Forge Slicer
		</template>
	</PrintAppShell>
</template>
