<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { TABS } from '@/constants/tabs.js'
import PrintAppShell from './components/PrintAppShell.vue'
import AppChromeBar from './components/AppChromeBar.vue'
import HelpDrawer from './components/HelpDrawer.vue'
import CommandPalette from './components/CommandPalette.vue'
import DropZoneOverlay from './components/DropZoneOverlay.vue'
import { saveCollapsibleState } from '@/utils/collapsible.js'
import { pickFileFromNextcloud } from '@/composables/useNextcloudFilePicker.js'
import { modelFilePickerFilter, modelFilePickerCanPick } from '@/shared/modelFileNode.js'

const PrepareTab = () => import(/* webpackChunkName: "nc-print-prepare" */ './components/PrepareTab.vue')
const SliceTab = () => import(/* webpackChunkName: "nc-print-slice" */ './components/SliceTab.vue')
const PrintTab = () => import(/* webpackChunkName: "nc-print-print" */ './components/PrintTab.vue')

export default {
	name: 'App',
	components: {
		PrintAppShell,
		AppChromeBar,
		HelpDrawer,
		PrepareTab,
		SliceTab,
		PrintTab,
		CommandPalette,
		DropZoneOverlay,
	},
	data() {
		return {
			helpOpen: false,
			paletteOpen: false,
			TABS,
			version: typeof __NC_PRINT_FRONTEND_VERSION__ !== 'undefined'
				? __NC_PRINT_FRONTEND_VERSION__
				: '1.8.1',
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
	mounted() {
		window.addEventListener('keydown', this.onGlobalKeydown)
		this.$nextTick(this.observeChromeHeight)
	},
	beforeDestroy() {
		window.removeEventListener('keydown', this.onGlobalKeydown)
		this.printStore.stopPrinterPolling()
		this.printStore.stopStatusPolling()
		if (this._chromeObserver) {
			this._chromeObserver.disconnect()
			this._chromeObserver = null
		}
	},
	methods: {
		observeChromeHeight() {
			const chrome = this.$el?.querySelector?.('.nc-print-chrome')
			const body = this.$el?.querySelector?.('.nc-gcs-app-shell__body') || chrome?.parentElement
			if (!chrome || !body) {
				return
			}
			const apply = () => {
				body.style.setProperty('--nc-print-chrome-h', `${Math.round(chrome.offsetHeight)}px`)
			}
			apply()
			if (typeof ResizeObserver !== 'undefined') {
				this._chromeObserver = new ResizeObserver(apply)
				this._chromeObserver.observe(chrome)
			}
		},
		openHelp() {
			this.helpOpen = true
		},
		onGlobalKeydown(e) {
			const mod = e.ctrlKey || e.metaKey
			// Command palette — allowed even while typing (it's a modifier combo).
			if (mod && e.key.toLowerCase() === 'k') {
				e.preventDefault()
				this.paletteOpen = !this.paletteOpen
				return
			}
			// Undo/redo — only on the Prepare tab; allowed regardless of focus
			// target so it works while a numeric transform field is focused too.
			if (mod && e.key.toLowerCase() === 'z' && this.printStore.activeTab === TABS.PREPARE) {
				e.preventDefault()
				window.dispatchEvent(new CustomEvent('nc-print-undo-redo', {
					detail: { redo: e.shiftKey },
				}))
				return
			}
			if (e.target?.closest('input, textarea, select, [contenteditable="true"]')) {
				return
			}
			if (mod && e.key.toLowerCase() === 'o') {
				e.preventDefault()
				void this.importModelShortcut()
				return
			}
			if (mod && e.key === 'Enter') {
				e.preventDefault()
				void this.sliceShortcut()
				return
			}
			if (e.key === '1') {
				this.printStore.setActiveTab(TABS.PREPARE)
			} else if (e.key === '2') {
				if (this.printStore.prepareComplete) {
					this.printStore.setActiveTab(TABS.SLICE)
				}
			} else if (e.key === '3') {
				if (this.printStore.printMonitorReachable || this.printStore.printStepEnabled) {
					this.printStore.setActiveTab(TABS.PRINT)
				}
			} else if (e.key.toLowerCase() === 'r' && !mod) {
				this.recenterShortcut()
			}
		},
		async importModelShortcut() {
			const file = await pickFileFromNextcloud({
				title: 'Select STL, 3MF, or OBJ',
				filter: modelFilePickerFilter,
				canPick: modelFilePickerCanPick,
			})
			if (file) {
				this.printStore.setModel(file, 'files')
				this.printStore.setActiveTab(TABS.PREPARE)
			}
		},
		// Command palette callbacks.
		paletteImport() {
			void this.importModelShortcut()
		},
		paletteFocusPanel(id) {
			// Persist the panel open (so a fresh PrintTab mount shows it expanded)
			// and broadcast so an already-mounted PrintPanel expands + scrolls.
			saveCollapsibleState(`print-${id}`, true)
			this.$nextTick(() => {
				window.dispatchEvent(new CustomEvent('nc-print-focus-panel', { detail: { id } }))
			})
		},
		async sliceShortcut() {
			if (this.printStore.activeTab === TABS.SLICE && this.printStore.hasModel && !this.printStore.sliceBlockReason) {
				try {
					await this.printStore.sliceOnly({})
				} catch {
					// store toasts
				}
			} else if (this.printStore.prepareComplete) {
				this.printStore.setActiveTab(TABS.SLICE)
			}
		},
		recenterShortcut() {
			if (this.printStore.activeTab !== TABS.PREPARE) {
				return
			}
			window.dispatchEvent(new CustomEvent('nc-print-recenter'))
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
				<span
					class="nc-print-dot"
					:class="'nc-print-dot--' + printStore.printerStatusClass"
					aria-hidden="true" />
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
			<AppChromeBar />
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

		<HelpDrawer :open.sync="helpOpen" :workflow-tab="printStore.activeTab" />

		<CommandPalette
			:open.sync="paletteOpen"
			:open-import="paletteImport"
			:focus-panel="paletteFocusPanel" />

		<DropZoneOverlay />

		<template #footer>
			NC 3D Print v{{ version }} · Moonraker + Forge Slicer
		</template>
	</PrintAppShell>
</template>
