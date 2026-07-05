<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { TABS } from '@/constants/tabs.js'
import { formatPrintTime } from '@/services/slicer-utils.js'
import SliceSummaryCard from './SliceSummaryCard.vue'
import ProfileSummaryChip from './ProfileSummaryChip.vue'
import NcPrintIcon from './NcPrintIcon.vue'

export default {
	name: 'SliceHandoffCard',
	components: { SliceSummaryCard, ProfileSummaryChip, NcPrintIcon },
	computed: {
		...mapStores(usePrintStore),
		done() {
			return this.printStore.sliceComplete
		},
		stats() {
			return this.printStore.lastCompletedSliceStats
		},
		checklistProgress() {
			return this.printStore.prepareChecklistProgress
		},
		targetLabel() {
			const p = this.printStore.activeTargetPrinter
			if (!p?.name) {
				return 'No target selected'
			}
			return this.printStore.targetConnectionLabel || p.name
		},
		timeLabel() {
			return this.stats ? formatPrintTime(this.stats.estimatedTimeS) : '—'
		},
		filamentLabel() {
			if (!this.stats) {
				return '—'
			}
			return `${Math.round(this.stats.filamentUsedG)} g`
		},
		supportLabel() {
			const g = this.stats?.supportFilamentG
			return g != null ? `${Math.round(g)} g` : null
		},
	},
	methods: {
		goPrint() {
			this.printStore.setActiveTab(TABS.PRINT)
		},
		goPrepareTarget() {
			this.printStore.setActiveTab(TABS.PREPARE)
			window.dispatchEvent(new CustomEvent('nc-print-checklist-action', { detail: { action: 'target' } }))
		},
		async sendGcode() {
			await this.printStore.sendSliceGcodeToPrinter({ start: false })
		},
		async sendAndStart() {
			const confirmed = await this.printStore.requestPrePrintConfirm()
			if (!confirmed) {
				return
			}
			await this.printStore.sendSliceGcodeToPrinter({ start: true })
		},
	},
}
</script>

<template>
	<div class="nc-print-card nc-print-handoff">
		<div class="nc-print-card__header">
			<h2 class="nc-print-card__title">
				<span class="nc-print-card__title-row">
					<NcPrintIcon name="cube" :size="18" />
					{{ done ? 'Slice result' : 'Ready to slice' }}
				</span>
			</h2>
			<span
				class="nc-print-badge"
				:class="done ? 'nc-print-badge--ok' : 'nc-print-badge--info'">
				{{ done ? 'Complete' : `${checklistProgress.ready}/${checklistProgress.total} ready` }}
			</span>
		</div>

		<template v-if="done">
			<p class="nc-print-handoff__target">
				Target: <strong>{{ targetLabel }}</strong>
				<button type="button" class="nc-print-link-btn" @click="goPrepareTarget">Change → Prepare</button>
			</p>
			<dl class="nc-print-slice-result__list">
				<div>
					<dt>Time</dt>
					<dd>{{ timeLabel }}</dd>
				</div>
				<div>
					<dt>Filament</dt>
					<dd>{{ filamentLabel }}</dd>
				</div>
				<div v-if="supportLabel">
					<dt>Support</dt>
					<dd>{{ supportLabel }}</dd>
				</div>
				<div>
					<dt>Profiles</dt>
					<dd><ProfileSummaryChip /></dd>
				</div>
			</dl>
			<div class="nc-print-actions">
				<button type="button" class="nc-print-btn nc-print-btn--primary" @click="sendAndStart">
					Send and start print
				</button>
				<button type="button" class="nc-print-btn" @click="sendGcode">
					Send G-code only
				</button>
				<button type="button" class="nc-print-btn" @click="goPrint">
					Monitor on Print →
				</button>
			</div>
		</template>

		<template v-else>
			<p v-if="printStore.selectedPrinterId" class="nc-print-handoff__target">
				Target: <strong>{{ targetLabel }}</strong>
				<button type="button" class="nc-print-link-btn" @click="goPrepareTarget">Change → Prepare</button>
			</p>
			<SliceSummaryCard class="nc-print-handoff__summary" />
		</template>
	</div>
</template>

<style scoped>
.nc-print-handoff__target {
	font-size: var(--nc-gcs-text-sm);
	margin: 0 0 12px;
}
.nc-print-handoff__summary {
	/* SliceSummaryCard is itself a card; flatten it inside the handoff card. */
	backdrop-filter: none;
	background: transparent;
	border: none;
	box-shadow: none;
	padding: 0;
}
</style>
