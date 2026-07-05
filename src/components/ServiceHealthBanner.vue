<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import ErrorRecoveryCard from './ErrorRecoveryCard.vue'
import { isHealthy, buildRecoveryCards } from '@/utils/service-health.js'

export default {
	name: 'ServiceHealthBanner',
	components: { ErrorRecoveryCard },
	computed: {
		...mapStores(usePrintStore),
		collapsedWhenHealthy() {
			return isHealthy(this.printStore.appStatus, {
				has3mfError: this.printStore.has3mfError,
				hasGcodeDownloadError: this.printStore.hasGcodeDownloadError,
				targetPrinterConnected: this.printStore.printerState.connected,
			})
		},
		recoveryCards() {
			const cards = buildRecoveryCards(this.printStore.appStatus, {
				has3mfError: this.printStore.has3mfError,
				convertError: this.printStore.model.convertError,
				hasGcodeDownloadError: this.printStore.hasGcodeDownloadError,
				gcodeError: this.printStore.sliceJob.error,
				selectedPrinterId: this.printStore.selectedPrinterId,
				hasTargetPrinter: !!this.printStore.activeTargetPrinter?.id,
				targetPrinterConnected: this.printStore.printerState.connected,
			})
			const retries = {
				slicer_offline: () => this.printStore.loadAppStatus(),
				moonraker_offline: () => this.printStore.loadAppStatus(),
				gcode_download_fail: () => this.printStore.retryDownloadGcode(),
			}
			return cards.map(c => ({ ...c, retry: retries[c.kind] }))
		},
	},
}
</script>

<template>
	<!-- Health surfaces ONLY when something is broken. A healthy lab shows
	     nothing (zero height) so the chrome bar stays a single clean row. -->
	<div v-if="printStore.appStatus.loaded && !collapsedWhenHealthy" class="nc-print-health-stack">
		<ErrorRecoveryCard
			v-for="(card, i) in recoveryCards"
			:key="card.kind + '-' + i"
			:kind="card.kind"
			:detail="card.detail"
			@retry="card.retry && card.retry()" />
	</div>
</template>

<style scoped>
.nc-print-health-stack {
	display: flex;
	flex-direction: column;
	gap: var(--nc-gcs-space-sm);
	margin-top: var(--nc-gcs-space-sm);
}
</style>
