<script>
import NcPrintCollapsible from './NcPrintCollapsible.vue'
import TargetPrinterPicker from './TargetPrinterPicker.vue'
import MaterialInfoPanel from './MaterialInfoPanel.vue'
import CalibrationPanel from './CalibrationPanel.vue'
import FilamentInventoryPanel from './FilamentInventoryPanel.vue'
import AnalyticsPanel from './AnalyticsPanel.vue'
import MaintenancePanel from './MaintenancePanel.vue'
import AchievementsPanel from './AchievementsPanel.vue'
import PrintHistoryPanel from './PrintHistoryPanel.vue'
import HistoryPanel from './HistoryPanel.vue'
import WebcamListPanel from './WebcamListPanel.vue'
import PartsLibraryPanel from './PartsLibraryPanel.vue'
import ModelForgePanel from './ModelForgePanel.vue'
import PrintGuardPanel from './PrintGuardPanel.vue'
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { TABS } from '@/constants/tabs.js'
import { consumeOverviewReturn, consumePendingOverviewSection, OVERVIEW_FOCUS_EVENT } from '@/utils/overview-nav.js'

/**
 * The management console — everything that isn't the current print project:
 * printer fleet, filament inventory, materials & calibration, history &
 * analytics, maintenance, achievements, parts library, model forge, print
 * guard, and cameras. A document-style page (collapsible sections), NOT the
 * immersive 3D studio layout the workflow tabs use. Reached via the Overview
 * control in the chrome bar (not a workflow step). Prepare and Ctrl+K can
 * deep-link straight to Parts library or Model Forge.
 */
export default {
	name: 'OverviewTab',
	components: {
		NcPrintCollapsible,
		TargetPrinterPicker,
		MaterialInfoPanel,
		CalibrationPanel,
		FilamentInventoryPanel,
		AnalyticsPanel,
		MaintenancePanel,
		AchievementsPanel,
		PrintHistoryPanel,
		HistoryPanel,
		WebcamListPanel,
		PartsLibraryPanel,
		ModelForgePanel,
		PrintGuardPanel,
	},
	data() {
		return {
			returnLabel: '',
		}
	},
	computed: {
		...mapStores(usePrintStore),
	},
	mounted() {
		window.addEventListener(OVERVIEW_FOCUS_EVENT, this.onFocusOverview)
		this.applyReturn(consumeOverviewReturn())
		this.focusSection(consumePendingOverviewSection())
	},
	beforeDestroy() {
		window.removeEventListener(OVERVIEW_FOCUS_EVENT, this.onFocusOverview)
	},
	methods: {
		onFocusOverview(e) {
			// This instance is already on screen, so drop the token a later
			// mount would otherwise scroll to.
			consumePendingOverviewSection()
			const label = consumeOverviewReturn()
			if (e?.detail?.fromPrepare) {
				this.applyReturn(e.detail.returnLabel || label)
			}
			this.focusSection(e?.detail?.id)
		},
		applyReturn(label) {
			if (label) {
				this.returnLabel = label
			}
		},
		backToPrepare() {
			this.returnLabel = ''
			this.printStore.setActiveTab(TABS.PREPARE)
		},
		focusSection(id) {
			if (!id) {
				return
			}
			const ref = this.$refs[id]
			const section = Array.isArray(ref) ? ref[0] : ref
			section?.expand?.()
			this.$nextTick(() => {
				const node = section?.$el || section
				node?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
			})
		},
	},
}
</script>

<template>
	<div class="nc-print-overview">
			<div v-if="returnLabel" class="nc-print-overview-return" role="status">
				<p class="nc-print-overview-return__text">
					{{ returnLabel }} opened from Prepare. The model stays on Prepare.
				</p>
				<button type="button" class="nc-print-btn nc-print-btn--primary" @click="backToPrepare">
					Back to Prepare
				</button>
			</div>
			<NcPrintCollapsible id="overview-printers" title="Printer fleet" icon="printer">
				<div class="nc-print-card">
					<TargetPrinterPicker variant="print" />
				</div>
			</NcPrintCollapsible>

			<NcPrintCollapsible id="overview-filament" title="Filament inventory" icon="spool" :default-open="false">
				<div class="nc-print-card">
					<FilamentInventoryPanel />
				</div>
			</NcPrintCollapsible>

			<NcPrintCollapsible id="overview-analytics" title="History &amp; analytics" icon="list" :default-open="false">
				<div class="nc-print-card">
					<AnalyticsPanel />
				</div>
				<PrintHistoryPanel />
				<HistoryPanel />
			</NcPrintCollapsible>

			<NcPrintCollapsible id="overview-maintenance" title="Maintenance" icon="bolt" :default-open="false">
				<div class="nc-print-card">
					<MaintenancePanel />
				</div>
			</NcPrintCollapsible>

			<NcPrintCollapsible id="overview-materials" title="Materials &amp; calibration" icon="thermometer" :default-open="false">
				<div class="nc-print-card">
					<MaterialInfoPanel />
				</div>
				<div class="nc-print-card">
					<CalibrationPanel />
				</div>
			</NcPrintCollapsible>

			<NcPrintCollapsible id="overview-achievements" title="Achievements" icon="check" :default-open="false">
				<div class="nc-print-card">
					<AchievementsPanel />
				</div>
			</NcPrintCollapsible>

			<NcPrintCollapsible id="overview-library" ref="overview-library" title="Parts Library" icon="folder" :default-open="false">
				<div class="nc-print-card">
					<PartsLibraryPanel />
				</div>
			</NcPrintCollapsible>

			<NcPrintCollapsible id="overview-modelforge" ref="overview-modelforge" title="Model Forge" icon="add" :default-open="false">
				<div class="nc-print-card">
					<ModelForgePanel />
				</div>
			</NcPrintCollapsible>

			<NcPrintCollapsible id="overview-guard" title="Print Guard" icon="alert" :default-open="false">
				<div class="nc-print-card">
					<PrintGuardPanel />
				</div>
			</NcPrintCollapsible>

			<NcPrintCollapsible id="overview-cameras" title="Cameras" icon="camera" :default-open="false">
				<div class="nc-print-card">
					<WebcamListPanel show-empty />
				</div>
			</NcPrintCollapsible>
	</div>
</template>

<style scoped>
.nc-print-overview {
	display: flex;
	flex-direction: column;
	gap: var(--nc-gcs-space-md);
}

.nc-print-overview-return {
	align-items: center;
	background: color-mix(in srgb, var(--nc-app-accent) 12%, var(--nc-gcs-bg-surface));
	border: 1px solid color-mix(in srgb, var(--nc-app-accent) 40%, var(--nc-gcs-border));
	border-radius: var(--nc-gcs-radius, 8px);
	display: flex;
	flex-wrap: wrap;
	gap: 12px;
	grid-column: 1 / -1;
	justify-content: space-between;
	padding: 10px 12px;
}

.nc-print-overview-return__text {
	color: var(--nc-gcs-text-primary);
	margin: 0;
}

@media (min-width: 1600px) {
	.nc-print-overview {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		align-items: start;
	}
}

/* Stack sections' inner cards with breathing room. */
.nc-print-overview :deep(.nc-print-card + .nc-print-card) {
	margin-top: var(--nc-gcs-space-md);
}
</style>
