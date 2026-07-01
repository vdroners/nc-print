<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import ErrorRecoveryCard from './ErrorRecoveryCard.vue'

export default {
	name: 'ServiceHealthBanner',
	components: { ErrorRecoveryCard },
	computed: {
		...mapStores(usePrintStore),
		collapsedWhenHealthy() {
			const s = this.printStore.appStatus
			return s.slicer_ok && s.moonraker_ok
				&& !this.printStore.has3mfError
				&& !this.printStore.hasGcodeDownloadError
		},
		recoveryCards() {
			const cards = []
			const s = this.printStore.appStatus
			if (s.loaded && s.slicer_enabled && !s.slicer_ok) {
				cards.push({
					kind: 'slicer_offline',
					detail: s.slicer_error || '',
					retry: () => this.printStore.loadAppStatus(),
				})
			}
			if (s.loaded && s.moonraker_enabled && !s.moonraker_ok) {
				cards.push({
					kind: 'moonraker_offline',
					detail: s.moonraker_error || '',
					retry: () => this.printStore.loadAppStatus(),
				})
			}
			if (this.printStore.has3mfError) {
				cards.push({
					kind: '3mf_fail',
					detail: this.printStore.model.convertError,
				})
			}
			if (this.printStore.hasGcodeDownloadError) {
				cards.push({
					kind: 'gcode_download_fail',
					detail: this.printStore.sliceJob.error,
					retry: () => this.printStore.retryDownloadGcode(),
				})
			}
			return cards
		},
		okMessage() {
			return 'Slicer and printer connected'
		},
	},
}
</script>

<template>
	<div v-if="printStore.appStatus.loaded && !collapsedWhenHealthy" class="nc-print-health-stack">
		<ErrorRecoveryCard
			v-for="(card, i) in recoveryCards"
			:key="card.kind + '-' + i"
			:kind="card.kind"
			:detail="card.detail"
			@retry="card.retry && card.retry()" />
	</div>
	<div
		v-else-if="printStore.appStatus.loaded && printStore.appStatus.slicer_ok && printStore.appStatus.moonraker_ok"
		class="nc-print-health-banner nc-print-health-banner--ok nc-print-health-banner--compact"
		role="status">
		{{ okMessage }}
	</div>
</template>

<style scoped>
.nc-print-health-stack {
	display: flex;
	flex-direction: column;
	gap: var(--nc-gcs-space-sm);
}

.nc-print-health-banner--compact {
	margin-bottom: var(--nc-gcs-space-md);
}
</style>
