<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { TABS } from '@/constants/tabs.js'
import PrepareChecklist from './PrepareChecklist.vue'
import SliceReviewPanel from './SliceReviewPanel.vue'
import SliceResultTabs from './SliceResultTabs.vue'
import JobHistoryPanel from './JobHistoryPanel.vue'
import ProfileSummaryChip from './ProfileSummaryChip.vue'
import PrePrintModal from './PrePrintModal.vue'
import WorkspaceRail from './WorkspaceRail.vue'
import ToolpathScrubber from './ToolpathScrubber.vue'
import NcPrintIcon from './NcPrintIcon.vue'
import SliceHandoffCard from './SliceHandoffCard.vue'
import ErrorRecoveryCard from './ErrorRecoveryCard.vue'
import ArrangePlate from './ArrangePlate.vue'
import CalibrationPanel from './CalibrationPanel.vue'
import { previewUrl } from '@/services/slicer-api.js'

export default {
	name: 'SliceTab',
	components: {
		PrepareChecklist,
		SliceReviewPanel,
		SliceResultTabs,
		JobHistoryPanel,
		ProfileSummaryChip,
		PrePrintModal,
		WorkspaceRail,
		ToolpathScrubber,
		NcPrintIcon,
		SliceHandoffCard,
		ErrorRecoveryCard,
		ArrangePlate,
		CalibrationPanel,
	},
	data() {
		return {
			abortController: null,
		}
	},
	computed: {
		...mapStores(usePrintStore),
		slicing() {
			return this.printStore.sliceJob.status === 'running'
		},
		slicerDisabled() {
			return !this.printStore.slicerReady
		},
		sliceBlockReason() {
			return this.printStore.sliceBlockReason
		},
		sliceActionsDisabled() {
			return this.slicing || this.slicerDisabled || !this.printStore.profilesReady
		},
		sliceDisabledTitle() {
			if (this.slicerDisabled) {
				return 'Slicer offline'
			}
			if (!this.printStore.profilesReady) {
				return this.printStore.sliceBlockReason
			}
			return ''
		},
		previewImageUrl() {
			if (!this.printStore.sliceJob.jobId) {
				return ''
			}
			return previewUrl(this.printStore.sliceJob.jobId)
		},
		sliceStatusBadge() {
			const status = this.printStore.sliceJob.status
			if (status === 'running') {
				return { label: 'Slicing', class: 'nc-print-badge--info' }
			}
			if (status === 'done') {
				return { label: 'Complete', class: 'nc-print-badge--ok' }
			}
			if (status === 'error') {
				return { label: 'Failed', class: 'nc-print-badge--danger' }
			}
			return null
		},
	},
	methods: {
		goPrepare() {
			this.printStore.setActiveTab(TABS.PREPARE)
		},
		async onSliceOnly() {
			this.abortController = new AbortController()
			try {
				await this.printStore.sliceOnly({ signal: this.abortController.signal })
			} catch (e) {
				if (e?.name !== 'AbortError') {
					// toast in store
				}
			} finally {
				this.abortController = null
			}
		},
		async onSliceAndSend() {
			this.abortController = new AbortController()
			try {
				await this.printStore.sliceAndSend({ signal: this.abortController.signal })
			} catch (e) {
				if (e?.name !== 'AbortError') {
					// toast in store
				}
			} finally {
				this.abortController = null
			}
		},
		cancelSlice() {
			this.printStore.cancelSlice(this.abortController)
			this.abortController = null
		},
		goPrint() {
			this.printStore.setActiveTab(TABS.PRINT)
		},
		async reloadProfiles() {
			await this.printStore.loadProfiles()
		},
		onChecklistAction(action) {
			if (action === 'slicer') {
				void this.reloadProfiles()
				return
			}
			this.printStore.setActiveTab(TABS.PREPARE)
			window.dispatchEvent(new CustomEvent('nc-print-checklist-action', { detail: { action } }))
		},
	},
	beforeUnmount() {
		if (this.abortController) {
			this.printStore.cancelSlice(this.abortController)
			this.abortController = null
		}
	},
}
</script>

<template>
	<WorkspaceRail class="nc-print-slice">
		<PrePrintModal />

		<div v-if="!printStore.hasModel" class="nc-print-card nc-print-slice-empty">
			<div class="nc-print-slice-empty__icon" aria-hidden="true">
				<NcPrintIcon name="cube" :size="40" />
			</div>
			<h2 class="nc-print-card__title">No model to slice</h2>
			<p class="nc-print-slice-hint">
				Import and prepare a model first, then return here to slice and send.
			</p>
			<button type="button" class="nc-print-btn nc-print-btn--primary" @click="goPrepare">
				Go to Prepare
			</button>
		</div>

		<template v-else>
			<PrepareChecklist blocking-only @action="onChecklistAction" />

			<ErrorRecoveryCard
				v-if="slicerDisabled"
				kind="slicer_offline"
				:detail="printStore.appStatus.slicer_error || ''"
				@retry="reloadProfiles" />

			<p v-else-if="sliceBlockReason && !slicing" class="nc-print-banner nc-print-banner--warn">
				{{ sliceBlockReason }}
			</p>

			<SliceHandoffCard />

			<SliceReviewPanel />

			<div class="nc-print-card nc-print-card--inset">
				<p class="nc-print-section-label">Settings</p>
				<p class="nc-print-slice-hint">
					Layer height, speeds, and temps are set on the
					<button type="button" class="nc-print-link-btn" @click="goPrepare">Prepare</button>
					tab under <strong>Override settings</strong>.
				</p>
			</div>

			<div class="nc-print-card nc-print-card--inset">
				<ArrangePlate />
			</div>

			<div class="nc-print-card nc-print-card--inset">
				<CalibrationPanel />
			</div>

			<div class="nc-print-card">
				<div class="nc-print-card__header">
					<h2 class="nc-print-card__title">
						<span class="nc-print-card__title-row">
							<NcPrintIcon name="cube" :size="18" />
							Slice
						</span>
					</h2>
					<span v-if="sliceStatusBadge" class="nc-print-badge" :class="sliceStatusBadge.class">
						{{ sliceStatusBadge.label }}
					</span>
				</div>
				<p class="nc-print-slice-model">
					{{ printStore.model.name }}
				</p>

				<div
					v-if="slicing"
					class="nc-print-progress"
					role="progressbar"
					:aria-valuenow="printStore.sliceJob.pct"
					aria-valuemin="0"
					aria-valuemax="100"
					:aria-label="printStore.sliceStageLabel">
					<div class="nc-print-progress__bar" :style="{ width: printStore.sliceJob.pct + '%' }" />
				</div>
				<p v-if="slicing" style="font-size: var(--nc-gcs-text-sm); margin: 8px 0 0;">
					{{ printStore.sliceStageLabel }} — {{ printStore.sliceJob.pct }}%
					<span v-if="printStore.sliceJob.totalLayers">
						· layer {{ printStore.sliceJob.layer }}/{{ printStore.sliceJob.totalLayers }}
					</span>
				</p>
				<div v-if="printStore.sliceJob.status === 'error'" class="nc-print-banner nc-print-banner--danger">
					<p class="nc-print-banner__error" style="margin-bottom: 8px;">
						{{ printStore.sliceJob.error }}
					</p>
					<button
						type="button"
						class="nc-print-btn nc-print-btn--primary"
						:disabled="sliceActionsDisabled"
						:title="sliceDisabledTitle"
						@click="onSliceOnly">
						Retry slice
					</button>
				</div>

				<p v-if="sliceBlockReason && !slicing" class="nc-print-slice-warn">
					{{ sliceBlockReason }}
				</p>

				<div class="nc-print-actions">
					<button
						type="button"
						class="nc-print-btn nc-print-btn--primary"
						:disabled="sliceActionsDisabled"
						:title="sliceDisabledTitle"
						@click="onSliceAndSend">
						Slice and send to printer
					</button>
					<button
						type="button"
						class="nc-print-btn"
						:disabled="sliceActionsDisabled"
						:title="sliceDisabledTitle"
						@click="onSliceOnly">
						Slice only
					</button>
					<button
						v-if="slicing"
						type="button"
						class="nc-print-btn nc-print-btn--danger"
						@click="cancelSlice">
						Cancel
					</button>
				</div>
			</div>

			<SliceResultTabs />

			<JobHistoryPanel />
		</template>

		<template #rail>
			<div v-if="previewImageUrl && printStore.sliceJob.status === 'done'" class="nc-print-card">
				<h2 class="nc-print-card__title">
					<span class="nc-print-card__title-row">
						<NcPrintIcon name="layers" :size="18" />
						Preview
					</span>
				</h2>
				<img
					:src="previewImageUrl"
					alt="Slice preview"
					class="nc-print-slice-preview-img">
			</div>
			<div class="nc-print-card nc-print-rail-toolpath">
				<ToolpathScrubber :gcode-blob="printStore.sliceJob.gcodeBlob" />
			</div>
		</template>
	</WorkspaceRail>
</template>

<style scoped>
.nc-print-slice-hint {
	color: var(--nc-gcs-text-muted);
	font-size: var(--nc-gcs-text-sm);
	margin: 0;
}

.nc-print-slice-model {
	color: var(--nc-gcs-text-muted);
	font-size: var(--nc-gcs-text-sm);
	margin: 0 0 8px;
}

.nc-print-slice-warn {
	color: var(--nc-gcs-warning, #eab308);
	font-size: var(--nc-gcs-text-sm);
	margin: 0 0 8px;
}

.nc-print-link-btn {
	appearance: none;
	background: none;
	border: none;
	color: var(--nc-app-accent);
	cursor: pointer;
	font: inherit;
	margin-left: 8px;
	text-decoration: underline;
}

.nc-print-slice-empty {
	align-items: center;
	display: flex;
	flex-direction: column;
	gap: var(--nc-gcs-space-sm);
	text-align: center;
}

.nc-print-slice-empty__icon {
	color: var(--nc-gcs-text-muted);
}

.nc-print-slice-preview-img {
	border-radius: var(--nc-gcs-radius-sm);
	max-width: 100%;
}

.nc-print-rail-toolpath {
	display: flex;
	flex: 1 1 auto;
	flex-direction: column;
	min-height: 280px;
}
</style>
