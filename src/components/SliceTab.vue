<script>
import { mapStores } from 'pinia'
import { usePrintStore, TABS } from '@/store/print.js'
import { previewUrl } from '@/services/slicer-api.js'
import PrepareChecklist from './PrepareChecklist.vue'
import SliceResultPanel from './SliceResultPanel.vue'
import ProfileSummaryChip from './ProfileSummaryChip.vue'
import GcodePreview from './GcodePreview.vue'

export default {
	name: 'SliceTab',
	components: { PrepareChecklist, SliceResultPanel, ProfileSummaryChip, GcodePreview },
	data() {
		return {
			abortController: null,
		}
	},
	computed: {
		...mapStores(usePrintStore),
		previewImageUrl() {
			if (!this.printStore.sliceJob.jobId) {
				return ''
			}
			return previewUrl(this.printStore.sliceJob.jobId)
		},
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
	},
}
</script>

<template>
	<div class="nc-print-slice">
		<div v-if="!printStore.hasModel" class="nc-print-card">
			<p>No model loaded.</p>
			<button type="button" class="nc-print-btn nc-print-btn--primary" @click="goPrepare">
				Go to Prepare
			</button>
		</div>

		<template v-else>
			<PrepareChecklist />

			<div class="nc-print-card">
				<h2 class="nc-print-card__title">Profiles</h2>
				<ProfileSummaryChip />
			</div>

			<div class="nc-print-card">
				<button
					type="button"
					class="nc-print-overrides-toggle"
					@click="printStore.toggleOverridesCollapsed()">
					Customize (advanced)
					<span>{{ printStore.overridesCollapsed ? '▸' : '▾' }}</span>
				</button>
				<div v-show="!printStore.overridesCollapsed" class="nc-print-overrides-grid">
					<div class="nc-print-field">
						<label>Layer height (mm)</label>
						<input v-model="printStore.overrides.layerHeight" type="number" step="0.01" min="0">
					</div>
					<div class="nc-print-field">
						<label>Line width (mm)</label>
						<input v-model="printStore.overrides.lineWidth" type="number" step="0.01" min="0">
					</div>
					<div class="nc-print-field">
						<label>Perimeters</label>
						<input v-model="printStore.overrides.perimeters" type="number" step="1" min="0">
					</div>
					<div class="nc-print-field">
						<label>Infill density (%)</label>
						<input v-model="printStore.overrides.infillDensity" type="number" step="1" min="0" max="100">
					</div>
					<div class="nc-print-field">
						<label>Print speed (mm/s)</label>
						<input v-model="printStore.overrides.printSpeed" type="number" step="1" min="0">
					</div>
					<div class="nc-print-field">
						<label>First layer speed (mm/s)</label>
						<input v-model="printStore.overrides.firstLayerSpeed" type="number" step="1" min="0">
					</div>
					<div class="nc-print-field">
						<label>Nozzle temp (°C)</label>
						<input v-model="printStore.overrides.nozzleTemp" type="number" step="1">
					</div>
					<div class="nc-print-field">
						<label>Bed temp (°C)</label>
						<input v-model="printStore.overrides.bedTemp" type="number" step="1">
					</div>
				</div>
			</div>

			<div class="nc-print-card">
				<h2 class="nc-print-card__title">Slice</h2>
				<p style="margin: 0 0 8px; color: var(--nc-gcs-text-muted); font-size: var(--nc-gcs-text-sm);">
					{{ printStore.model.name }}
				</p>

				<div v-if="slicing" class="nc-print-progress">
					<div class="nc-print-progress__bar" :style="{ width: printStore.sliceJob.pct + '%' }" />
				</div>
				<p v-if="slicing" style="font-size: var(--nc-gcs-text-sm); margin: 8px 0 0;">
					{{ printStore.sliceJob.stage || 'slicing' }} — {{ printStore.sliceJob.pct }}%
					<span v-if="printStore.sliceJob.totalLayers">
						· layer {{ printStore.sliceJob.layer }}/{{ printStore.sliceJob.totalLayers }}
					</span>
				</p>
				<p v-if="printStore.sliceJob.status === 'error'" style="color: var(--nc-gcs-danger-soft);">
					{{ printStore.sliceJob.error }}
				</p>

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

			<SliceResultPanel />

			<div v-if="printStore.sliceComplete" class="nc-print-actions nc-print-slice-handoff">
				<button type="button" class="nc-print-btn nc-print-btn--primary" @click="goPrint">
					Monitor on Print →
				</button>
			</div>

			<div v-if="previewImageUrl && printStore.sliceJob.status === 'done'" class="nc-print-card">
				<h2 class="nc-print-card__title">Preview</h2>
				<img
					:src="previewImageUrl"
					alt="Slice preview"
					style="max-width: 100%; border-radius: var(--nc-gcs-radius-sm);">
			</div>

			<GcodePreview :gcode-blob="printStore.sliceJob.gcodeBlob" />
		</template>
	</div>
</template>

<style scoped>
.nc-print-overrides-toggle {
	appearance: none;
	background: transparent;
	border: none;
	color: var(--nc-gcs-text-primary);
	cursor: pointer;
	font-family: inherit;
	font-size: var(--nc-gcs-text-base);
	font-weight: 600;
	padding: 0;
	width: 100%;
	text-align: left;
}

.nc-print-overrides-grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
	gap: var(--nc-gcs-space-sm);
	margin-top: var(--nc-gcs-space-md);
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

.nc-print-slice-handoff {
	margin-top: var(--nc-gcs-space-md);
}
</style>
