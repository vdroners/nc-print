<script>
import { mapStores } from 'pinia'
import { usePrintStore, TABS } from '@/store/print.js'
import PrepareChecklist from './PrepareChecklist.vue'
import SliceReviewPanel from './SliceReviewPanel.vue'
import SliceResultTabs from './SliceResultTabs.vue'
import JobHistoryPanel from './JobHistoryPanel.vue'
import ProfileSummaryChip from './ProfileSummaryChip.vue'
import PrePrintModal from './PrePrintModal.vue'
import WorkspaceRail from './WorkspaceRail.vue'
import ToolpathScrubber from './ToolpathScrubber.vue'
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
			if (!this.printStore.sliceJob.jobId || this.printStore.featureFlags.forgePreview) {
				return ''
			}
			return previewUrl(this.printStore.sliceJob.jobId)
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

		<div v-if="!printStore.hasModel" class="nc-print-card">
			<p>No model loaded.</p>
			<button type="button" class="nc-print-btn nc-print-btn--primary" @click="goPrepare">
				Go to Prepare
			</button>
		</div>

		<template v-else>
			<PrepareChecklist @action="onChecklistAction" />

			<div class="nc-print-card">
				<h2 class="nc-print-card__title">Profiles</h2>
				<ProfileSummaryChip />
			</div>

			<SliceReviewPanel />

			<div class="nc-print-card nc-print-card--muted">
				<p style="margin: 0; font-size: var(--nc-gcs-text-sm); color: var(--nc-gcs-text-muted);">
					Layer height, speeds, and temps are set on the
					<button type="button" class="nc-print-link-btn" @click="goPrepare">Prepare</button>
					tab under <strong>Override settings</strong>.
				</p>
			</div>

			<div class="nc-print-card">
				<h2 class="nc-print-card__title">Slice</h2>
				<p style="margin: 0 0 8px; color: var(--nc-gcs-text-muted); font-size: var(--nc-gcs-text-sm);">
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
				<div v-if="printStore.sliceJob.status === 'error'" class="nc-print-slice-error">
					<p style="color: var(--nc-gcs-danger-soft); margin: 0;">
						{{ printStore.sliceJob.error }}
					</p>
					<button
						type="button"
						class="nc-print-btn nc-print-btn--primary"
						style="margin-top: 8px;"
						:disabled="sliceActionsDisabled"
						:title="sliceDisabledTitle"
						@click="onSliceOnly">
						Retry slice
					</button>
				</div>

				<p v-if="sliceBlockReason && !slicing" style="font-size: var(--nc-gcs-text-sm); color: var(--nc-gcs-warning, #eab308); margin: 0 0 8px;">
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

			<div v-if="printStore.sliceComplete" class="nc-print-actions nc-print-slice-handoff">
				<button type="button" class="nc-print-btn nc-print-btn--primary" @click="goPrint">
					Monitor on Print →
				</button>
			</div>

			<JobHistoryPanel />
		</template>

		<template #rail>
			<div v-if="previewImageUrl && printStore.sliceJob.status === 'done'" class="nc-print-card">
				<h2 class="nc-print-card__title">Preview</h2>
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

.nc-print-slice-handoff {
	margin-top: var(--nc-gcs-space-md);
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
