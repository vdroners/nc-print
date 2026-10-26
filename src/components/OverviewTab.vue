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
import { consumePendingOverviewSection, OVERVIEW_FOCUS_EVENT } from '@/utils/overview-nav.js'

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
	mounted() {
		window.addEventListener(OVERVIEW_FOCUS_EVENT, this.onFocusOverview)
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
			this.focusSection(e?.detail?.id)
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

			<NcPrintCollapsible id="overview-library" ref="overview-library" title="Parts library" icon="folder" :default-open="false">
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
				<WebcamListPanel />
			</NcPrintCollapsible>
	</div>
</template>

<style scoped>
.nc-print-overview {
	display: flex;
	flex-direction: column;
	gap: var(--nc-gcs-space-md);
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
