<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { previewUrl } from '@/services/slicer-api.js'
import SliceResultPanel from './SliceResultPanel.vue'
import GcodePreview from './GcodePreview.vue'
import ProfileSummaryChip from './ProfileSummaryChip.vue'
import SliceReviewPanel from './SliceReviewPanel.vue'
import PreviewLightbox from './PreviewLightbox.vue'

const TABS = [
	{ id: 'summary', label: 'Summary' },
	{ id: 'toolpath', label: 'Toolpath' },
	{ id: 'gcode', label: 'G-code' },
	{ id: 'settings', label: 'Settings' },
]

export default {
	name: 'SliceResultTabs',
	components: {
		SliceResultPanel,
		GcodePreview,
		ProfileSummaryChip,
		SliceReviewPanel,
		PreviewLightbox,
	},
	data() {
		return {
			activeTab: 'summary',
			lightboxOpen: false,
			tabs: TABS,
		}
	},
	computed: {
		...mapStores(usePrintStore),
		show() {
			return this.printStore.sliceJob.status === 'done'
		},
		previewImageUrl() {
			if (!this.printStore.sliceJob.jobId) {
				return ''
			}
			return previewUrl(this.printStore.sliceJob.jobId)
		},
		tabIds() {
			return this.tabs.map(t => t.id)
		},
		activeTabIndex() {
			return this.tabIds.indexOf(this.activeTab)
		},
	},
	methods: {
		onTabKeydown(e) {
			const { key } = e
			if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'Home' && key !== 'End') {
				return
			}
			e.preventDefault()
			let next = this.activeTabIndex
			if (key === 'ArrowLeft') {
				next = (next - 1 + this.tabIds.length) % this.tabIds.length
			} else if (key === 'ArrowRight') {
				next = (next + 1) % this.tabIds.length
			} else if (key === 'Home') {
				next = 0
			} else if (key === 'End') {
				next = this.tabIds.length - 1
			}
			this.activeTab = this.tabIds[next]
			this.$nextTick(() => {
				const btn = this.$el?.querySelector(`#slice-result-tab-${this.activeTab}`)
				btn?.focus()
			})
		},
	},
}
</script>

<template>
	<div v-if="show" class="nc-print-card nc-print-slice-result-tabs">
		<div
			class="nc-print-slice-result-tabs__bar"
			role="tablist"
			aria-label="Slice result"
			@keydown="onTabKeydown">
			<button
				v-for="tab in tabs"
				:id="'slice-result-tab-' + tab.id"
				:key="tab.id"
				type="button"
				class="nc-print-slice-result-tabs__tab"
				:class="{ 'nc-print-slice-result-tabs__tab--active': activeTab === tab.id }"
				role="tab"
				:aria-selected="activeTab === tab.id"
				:aria-controls="'slice-result-panel-' + tab.id"
				@click="activeTab = tab.id">
				{{ tab.label }}
			</button>
		</div>

		<div
			v-show="activeTab === 'summary'"
			id="slice-result-panel-summary"
			role="tabpanel"
			aria-labelledby="slice-result-tab-summary">
			<SliceResultPanel :embedded="true" />
		</div>

		<div
			v-show="activeTab === 'toolpath'"
			id="slice-result-panel-toolpath"
			role="tabpanel"
			aria-labelledby="slice-result-tab-toolpath"
			class="nc-print-slice-result-tabs__panel">
			<p v-if="!previewImageUrl" class="nc-print-slice-result-tabs__empty">
				No toolpath preview image for this job.
			</p>
			<template v-else>
				<button
					type="button"
					class="nc-print-slice-result-tabs__preview-btn"
					@click="lightboxOpen = true">
					<img
						:src="previewImageUrl"
						alt="Slice toolpath preview"
						class="nc-print-slice-result-tabs__preview-img">
					<span class="nc-print-slice-result-tabs__preview-hint">Click for full screen</span>
				</button>
				<PreviewLightbox
					:open="lightboxOpen"
					:src="previewImageUrl"
					alt="Slice toolpath preview"
					@close="lightboxOpen = false" />
			</template>
		</div>

		<div
			v-show="activeTab === 'gcode'"
			id="slice-result-panel-gcode"
			role="tabpanel"
			aria-labelledby="slice-result-tab-gcode">
			<GcodePreview :gcode-blob="printStore.sliceJob.gcodeBlob" />
		</div>

		<div
			v-show="activeTab === 'settings'"
			id="slice-result-panel-settings"
			role="tabpanel"
			aria-labelledby="slice-result-tab-settings"
			class="nc-print-slice-result-tabs__panel">
			<ProfileSummaryChip />
			<SliceReviewPanel />
		</div>
	</div>
</template>

<style scoped>
.nc-print-slice-result-tabs__bar {
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
	margin-bottom: var(--nc-gcs-space-md);
}

.nc-print-slice-result-tabs__tab {
	appearance: none;
	background: transparent;
	border: 1px solid var(--nc-gcs-border);
	border-radius: var(--nc-gcs-radius-sm);
	color: var(--nc-gcs-text-secondary);
	cursor: pointer;
	font: inherit;
	font-size: var(--nc-gcs-text-sm);
	padding: 6px 12px;
}

.nc-print-slice-result-tabs__tab--active {
	background: color-mix(in srgb, var(--nc-app-accent) 15%, transparent);
	border-color: var(--nc-app-accent);
	color: var(--nc-gcs-text-primary);
	font-weight: 600;
}

.nc-print-slice-result-tabs__panel {
	margin-top: var(--nc-gcs-space-sm);
}

.nc-print-slice-result-tabs__empty {
	color: var(--nc-gcs-text-muted);
	font-size: var(--nc-gcs-text-sm);
	margin: 0;
}

.nc-print-slice-result-tabs__preview-btn {
	appearance: none;
	background: none;
	border: none;
	cursor: zoom-in;
	display: block;
	padding: 0;
	position: relative;
	width: 100%;
}

.nc-print-slice-result-tabs__preview-img {
	border-radius: var(--nc-gcs-radius-sm);
	display: block;
	max-width: 100%;
}

.nc-print-slice-result-tabs__preview-hint {
	bottom: 8px;
	color: #fff;
	font-size: var(--nc-gcs-text-sm);
	left: 50%;
	position: absolute;
	text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
	transform: translateX(-50%);
}
</style>
