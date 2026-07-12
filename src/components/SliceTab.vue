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
import PrepareStudioLayout from './PrepareStudioLayout.vue'
import Toolpath3D from './Toolpath3D.vue'
import NcPrintIcon from './NcPrintIcon.vue'
import SliceHandoffCard from './SliceHandoffCard.vue'
import ErrorRecoveryCard from './ErrorRecoveryCard.vue'
import ArrangePlate from './ArrangePlate.vue'
import CalibrationPanel from './CalibrationPanel.vue'
import MaterialInfoPanel from './MaterialInfoPanel.vue'
import ColorOrderPanel from './ColorOrderPanel.vue'
import PausePlanner from './PausePlanner.vue'

export default {
	name: 'SliceTab',
	components: {
		PrepareChecklist,
		SliceReviewPanel,
		SliceResultTabs,
		JobHistoryPanel,
		ProfileSummaryChip,
		PrePrintModal,
		PrepareStudioLayout,
		Toolpath3D,
		NcPrintIcon,
		SliceHandoffCard,
		ErrorRecoveryCard,
		ArrangePlate,
		CalibrationPanel,
		MaterialInfoPanel,
		ColorOrderPanel,
		PausePlanner,
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
			return this.slicing || this.slicerDisabled || !!this.sliceBlockReason
		},
		sliceDisabledTitle() {
			if (this.slicing) {
				return 'Slicing in progress'
			}
			if (this.sliceBlockReason) {
				return this.sliceBlockReason
			}
			if (this.slicerDisabled) {
				return 'Slicer offline'
			}
			return ''
		},
		hasSlice() {
			return this.printStore.sliceJob.status === 'done' && !!this.printStore.sliceJob.jobId
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
	<PrepareStudioLayout class="nc-print-slice nc-print-slice--immersive" mode="immersive">
		<!-- ── Center: the sliced toolpath fills the background (Creality/Orca feel). ── -->
		<template #center>
			<div class="nc-print-slice-stage">
				<Toolpath3D
					v-if="hasSlice"
					:job-id="printStore.sliceJob.jobId"
					:build-volume="printStore.buildVolume"
					mode="immersive" />
				<div v-else class="nc-print-slice-stage__empty">
					<NcPrintIcon name="layers" :size="44" />
					<p v-if="!printStore.hasModel">
						Import and prepare a model, then slice to see the toolpath here.
					</p>
					<p v-else-if="slicing">
						Slicing {{ printStore.model.name }} — the toolpath appears here when it finishes.
					</p>
					<p v-else>
						Slice <strong>{{ printStore.model.name }}</strong> to preview the g-code layer by layer.
					</p>
				</div>
			</div>
		</template>

		<!-- ── Left: workflow + slice actions float over the toolpath. ── -->
		<template #left>
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

				<SliceHandoffCard />

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
					<PausePlanner />
				</div>

				<div class="nc-print-card nc-print-card--inset">
					<ColorOrderPanel />
				</div>

				<div class="nc-print-card nc-print-card--inset">
					<CalibrationPanel />
				</div>

				<div class="nc-print-card nc-print-card--inset">
					<MaterialInfoPanel />
				</div>
			</template>
		</template>

		<!-- ── Right: slice results + review + history float on the far side. ── -->
		<template #right>
			<SliceReviewPanel />

			<SliceResultTabs />

			<JobHistoryPanel />
		</template>
	</PrepareStudioLayout>
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

/* ── Center stage: the toolpath viewport fills the immersive background. ────── */
.nc-print-slice-stage {
	position: relative;
	width: 100%;
	height: 100%;
	min-height: clamp(360px, 52vh, 640px);
	border-radius: var(--nc-gcs-radius-md, 12px);
	overflow: hidden;
	background: #161b22;
}

.nc-print-slice-stage__empty {
	position: absolute;
	inset: 0;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: var(--nc-gcs-space-sm);
	padding: var(--nc-gcs-space-lg);
	text-align: center;
	color: var(--nc-gcs-text-muted);
}

.nc-print-slice-stage__empty p {
	margin: 0;
	max-width: 42ch;
	font-size: var(--nc-gcs-text-sm);
}

/* On wide screens the center IS the background; fill it edge-to-edge. */
@media (min-width: 1201px) {
	.nc-print-slice--immersive .nc-print-slice-stage {
		height: 100%;
		min-height: 0;
		border-radius: 0;
	}
}
</style>
