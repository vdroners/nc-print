<script>
import { mapStores } from 'pinia'
import { usePrintStore, TABS } from '@/store/print.js'
import PrintAppShell from './components/PrintAppShell.vue'
import ServiceHealthBanner from './components/ServiceHealthBanner.vue'
import JobSummaryStrip from './components/JobSummaryStrip.vue'
import PrintWorkflowBanner from './components/PrintWorkflowBanner.vue'
import HelpDrawer from './components/HelpDrawer.vue'

const PrepareTab = () => import(/* webpackChunkName: "nc-print-prepare" */ './components/PrepareTab.vue')
const SliceTab = () => import(/* webpackChunkName: "nc-print-slice" */ './components/SliceTab.vue')
const PrintTab = () => import(/* webpackChunkName: "nc-print-print" */ './components/PrintTab.vue')

export default {
	name: 'App',
	components: {
		PrintAppShell,
		ServiceHealthBanner,
		JobSummaryStrip,
		PrintWorkflowBanner,
		HelpDrawer,
		PrepareTab,
		SliceTab,
		PrintTab,
	},
	data() {
		return {
			helpOpen: false,
			TABS,
			version: typeof __NC_PRINT_FRONTEND_VERSION__ !== 'undefined'
				? __NC_PRINT_FRONTEND_VERSION__
				: '1.3.0',
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

		<div class="nc-print-chrome">
			<PrintWorkflowBanner />
			<ServiceHealthBanner />
			<JobSummaryStrip />
		</div>

		<div
			:id="tabPanelId"
			class="nc-print-tab-scroll"
			role="tabpanel"
			:aria-label="printStore.activeTab + ' workflow step'">
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
