<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import ErrorRecoveryCard from './ErrorRecoveryCard.vue'
import { isHealthy, buildRecoveryCards } from '@/utils/service-health.js'

// Short chip labels per fault kind — keeps the collapsed row to one line.
const CHIP_LABELS = {
	slicer_offline: 'Slicer offline',
	slicer_setup: 'Slicer not configured',
	moonraker_offline: 'Printer unreachable',
	moonraker_setup: 'Printer not configured',
	'3mf_fail': '3MF conversion failed',
	gcode_download_fail: 'G-code download failed',
	generic: 'Service issue',
}

export default {
	name: 'ServiceHealthBanner',
	components: { ErrorRecoveryCard },
	data() {
		return {
			// Collapsed by default: a fault shows only as a compact chip so it never
			// eats the viewport. The operator expands it for the full recovery steps.
			expanded: false,
		}
	},
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
		show() {
			return this.printStore.appStatus.loaded && !this.collapsedWhenHealthy && this.recoveryCards.length > 0
		},
		// One-line summary for the collapsed chip: the fault labels joined.
		chipSummary() {
			const labels = this.recoveryCards.map(c => CHIP_LABELS[c.kind] || CHIP_LABELS.generic)
			if (labels.length <= 2) {
				return labels.join(' · ')
			}
			return `${labels[0]} + ${labels.length - 1} more`
		},
		// The primary retry (first card that has one) for the chip's inline button.
		primaryRetry() {
			return this.recoveryCards.find(c => c.retry) || null
		},
	},
	methods: {
		toggle() {
			this.expanded = !this.expanded
		},
	},
}
</script>

<template>
	<!-- Health surfaces ONLY when something is broken, and then as a compact,
	     expandable chip so it never eats the viewport (a healthy lab shows
	     nothing at all). Click the chip to reveal the full recovery steps. -->
	<div v-if="show" class="nc-print-health">
		<div class="nc-print-health-chip" :class="{ 'is-open': expanded }">
			<button
				type="button"
				class="nc-print-health-chip__toggle"
				:aria-expanded="expanded ? 'true' : 'false'"
				@click="toggle">
				<span class="nc-print-health-chip__dot" aria-hidden="true">⚠</span>
				<span class="nc-print-health-chip__label">{{ chipSummary }}</span>
				<span class="nc-print-health-chip__caret" aria-hidden="true">{{ expanded ? '▴' : '▾' }}</span>
			</button>
			<button
				v-if="primaryRetry"
				type="button"
				class="nc-print-health-chip__retry"
				@click.stop="primaryRetry.retry()">
				Retry
			</button>
		</div>

		<div v-if="expanded" class="nc-print-health-stack">
			<ErrorRecoveryCard
				v-for="(card, i) in recoveryCards"
				:key="card.kind + '-' + i"
				:kind="card.kind"
				:detail="card.detail"
				@retry="card.retry && card.retry()" />
		</div>
	</div>
</template>

<style scoped>
.nc-print-health {
	margin-top: var(--nc-gcs-space-sm);
}

/* Collapsed chip — a single compact row, not a viewport-eating card. */
.nc-print-health-chip {
	align-items: center;
	background: color-mix(in srgb, var(--nc-gcs-danger) 16%, transparent);
	border: 1px solid color-mix(in srgb, var(--nc-gcs-danger) 45%, transparent);
	border-radius: 999px;
	color: var(--nc-gcs-danger-soft);
	display: inline-flex;
	gap: 8px;
	max-width: 100%;
	padding: 3px 6px 3px 10px;
}

.nc-print-health-chip.is-open {
	border-bottom-left-radius: 8px;
	border-bottom-right-radius: 8px;
}

.nc-print-health-chip__toggle {
	align-items: center;
	appearance: none;
	background: none;
	border: none;
	color: inherit;
	cursor: pointer;
	display: flex;
	font: inherit;
	font-size: var(--nc-gcs-text-sm);
	gap: 6px;
	min-width: 0;
	padding: 2px 0;
}

.nc-print-health-chip__label {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.nc-print-health-chip__caret {
	font-size: 10px;
	opacity: 0.8;
}

.nc-print-health-chip__retry {
	appearance: none;
	background: color-mix(in srgb, var(--nc-gcs-danger) 30%, transparent);
	border: none;
	border-radius: 999px;
	color: inherit;
	cursor: pointer;
	flex: 0 0 auto;
	font: inherit;
	font-size: 11px;
	font-weight: 600;
	padding: 3px 10px;
}

.nc-print-health-chip__retry:hover {
	background: color-mix(in srgb, var(--nc-gcs-danger) 45%, transparent);
}

.nc-print-health-stack {
	display: flex;
	flex-direction: column;
	gap: var(--nc-gcs-space-sm);
	margin-top: var(--nc-gcs-space-sm);
}
</style>
