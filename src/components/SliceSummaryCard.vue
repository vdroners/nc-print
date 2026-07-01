<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import NcPrintIcon from './NcPrintIcon.vue'

export default {
	name: 'SliceSummaryCard',
	components: { NcPrintIcon },
	computed: {
		...mapStores(usePrintStore),
		sliceFilename() {
			const blob = this.printStore.meshState.sliceBlob
			if (blob?.name) {
				return blob.name
			}
			if (this.printStore.model.sliceFile?.name) {
				return this.printStore.model.sliceFile.name
			}
			return this.printStore.model.name || '—'
		},
		bboxLabel() {
			const bbox = this.printStore.modelMeta.bbox
			if (!bbox) {
				return '—'
			}
			return `${Math.round(bbox.x)}×${Math.round(bbox.y)}×${Math.round(bbox.z)} mm`
		},
		fitsBedLabel() {
			if (!this.printStore.modelMeta.bbox) {
				return 'Unknown'
			}
			return this.printStore.modelMeta.fitsBed ? 'Fits bed' : 'May exceed bed'
		},
		fitsBedClass() {
			if (!this.printStore.modelMeta.bbox) {
				return 'nc-print-badge--info'
			}
			return this.printStore.modelMeta.fitsBed
				? 'nc-print-badge--ok'
				: 'nc-print-badge--warn'
		},
		profileSummary() {
			const n = this.printStore.selectedProfileNames
			return `${n.printer} · ${n.filament} · ${n.process}`
		},
		showDirtyBadge() {
			return this.printStore.meshState.dirty
		},
		appliedLabel() {
			const at = this.printStore.meshState.appliedAt
			if (!at) {
				return ''
			}
			try {
				return `Applied ${new Date(at).toLocaleTimeString()}`
			} catch {
				return 'Applied'
			}
		},
	},
}
</script>

<template>
	<div v-if="printStore.hasModel" class="nc-print-card nc-print-slice-summary">
		<h2 class="nc-print-card__title">
			<span class="nc-print-card__title-row">
				<NcPrintIcon name="layers" :size="18" />
				Slice input
			</span>
		</h2>
		<dl class="nc-print-slice-summary__list">
			<div>
				<dt>File</dt>
				<dd>{{ sliceFilename }}</dd>
			</div>
			<div>
				<dt>Size</dt>
				<dd>{{ bboxLabel }}</dd>
			</div>
			<div>
				<dt>Bed</dt>
				<dd>
					<span class="nc-print-badge" :class="fitsBedClass">{{ fitsBedLabel }}</span>
				</dd>
			</div>
			<div v-if="showDirtyBadge">
				<dt>Mesh</dt>
				<dd>
					<span class="nc-print-badge nc-print-badge--warn">Transform pending</span>
				</dd>
			</div>
			<div>
				<dt>Profiles</dt>
				<dd class="nc-print-slice-summary__profiles">{{ profileSummary }}</dd>
			</div>
		</dl>
		<p v-if="appliedLabel && !showDirtyBadge" class="nc-print-slice-summary__applied">
			<span class="nc-print-badge nc-print-badge--ok">{{ appliedLabel }}</span>
		</p>
	</div>
</template>

<style scoped>
.nc-print-slice-summary__list {
	display: grid;
	gap: 8px;
	margin: 0;
}

.nc-print-slice-summary__list div {
	display: flex;
	flex-wrap: wrap;
	font-size: var(--nc-gcs-text-sm);
	gap: 6px 10px;
}

.nc-print-slice-summary__list dt {
	color: var(--nc-gcs-text-muted);
	min-width: 52px;
}

.nc-print-slice-summary__list dd {
	margin: 0;
	word-break: break-word;
}

.nc-print-slice-summary__profiles {
	color: var(--nc-gcs-text-secondary);
}

.nc-print-slice-summary__applied {
	margin: var(--nc-gcs-space-sm) 0 0;
}
</style>
