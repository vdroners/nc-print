<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { TABS } from '@/constants/tabs.js'
import { formatPrintTime, estimatePrintTimeBand, resolveFilamentPricePerKg, estimateFilamentCost } from '@/services/slicer-utils.js'
import NcPrintIcon from './NcPrintIcon.vue'

export default {
	name: 'SliceSummaryCard',
	components: { NcPrintIcon },
	data() {
		return { abortController: null }
	},
	computed: {
		...mapStores(usePrintStore),
		slicing() {
			return this.printStore.sliceJob.status === 'running'
		},
		sliceBlockReason() {
			return this.printStore.sliceBlockReason
		},
		sliceDisabled() {
			return this.slicing || !this.printStore.slicerReady || !!this.sliceBlockReason
		},
		sliceDisabledTitle() {
			if (this.slicing) return 'Slicing…'
			if (this.sliceBlockReason) return this.sliceBlockReason
			if (!this.printStore.slicerReady) return 'Slicer offline'
			return 'Slice this model'
		},
		// Live estimate: the last completed slice if present, else a rough band.
		estimate() {
			const stats = this.printStore.lastCompletedSliceStats
			if (stats) {
				const price = resolveFilamentPricePerKg(this.printStore.config, {})
				const cost = estimateFilamentCost(stats.filamentUsedG, price)
				return {
					exact: true,
					time: formatPrintTime(stats.estimatedTimeS),
					filament: `${Math.round(stats.filamentUsedG)} g`,
					cost: cost != null ? cost.toFixed(2) : null,
				}
			}
			const bbox = this.printStore.modelMeta.bbox
			const lh = Number(this.printStore.overrides.layerHeight) || 0.2
			if (!bbox) {
				return null
			}
			const band = estimatePrintTimeBand(bbox, lh)
			return band ? { exact: false, time: band, filament: null, cost: null } : null
		},
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
			// Per-object out-of-bed (any axis, incl. Z) takes priority — it's the
			// most specific signal when the scene has multiple objects.
			const n = this.printStore.outOfBedIds?.length || 0
			if (n > 0) {
				return n === 1 ? '1 object off bed' : `${n} objects off bed`
			}
			if (!this.printStore.modelMeta.bbox) {
				return 'Unknown'
			}
			return this.printStore.modelMeta.fitsBed ? 'Fits bed' : 'May exceed bed'
		},
		fitsBedClass() {
			if ((this.printStore.outOfBedIds?.length || 0) > 0) {
				return 'nc-print-badge--warn'
			}
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
	methods: {
		async sliceNow() {
			if (this.sliceDisabled) {
				return
			}
			this.abortController = new AbortController()
			try {
				await this.printStore.sliceOnly({ signal: this.abortController.signal })
				// Wave A: a successful Slice now hands the operator straight to
				// the Slice tab (toolpath preview + send actions).
				if (this.printStore.sliceJob.status === 'done') {
					this.printStore.setActiveTab(TABS.SLICE)
				}
			} catch (e) {
				// store toasts on failure; AbortError is a user cancel
			} finally {
				this.abortController = null
			}
		},
		cancelSlice() {
			this.printStore.cancelSlice(this.abortController)
			this.abortController = null
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

		<!-- Persistent estimate (last slice, or a rough pre-slice band) + one-click
		     Slice — so print time/filament/cost don't hide behind the Slice tab. -->
		<div v-if="estimate" class="nc-print-slice-summary__estimate">
			<div class="nc-print-slice-summary__est-row">
				<span class="nc-print-slice-summary__est-label">Print time</span>
				<span class="nc-print-slice-summary__est-value">{{ estimate.time }}</span>
			</div>
			<div v-if="estimate.filament" class="nc-print-slice-summary__est-row">
				<span class="nc-print-slice-summary__est-label">Filament</span>
				<span class="nc-print-slice-summary__est-value">{{ estimate.filament }}</span>
			</div>
			<div v-if="estimate.cost" class="nc-print-slice-summary__est-row">
				<span class="nc-print-slice-summary__est-label">Est. cost</span>
				<span class="nc-print-slice-summary__est-value">{{ estimate.cost }}</span>
			</div>
			<p v-if="!estimate.exact" class="nc-print-slice-summary__est-hint">
				Rough estimate — slice for exact figures.
			</p>
		</div>

		<div class="nc-print-slice-summary__actions">
			<button
				v-if="!slicing"
				type="button"
				class="nc-print-btn nc-print-btn--primary"
				:disabled="sliceDisabled"
				:title="sliceDisabledTitle"
				@click="sliceNow">
				Slice now
			</button>
			<button
				v-else
				type="button"
				class="nc-print-btn nc-print-btn--danger"
				@click="cancelSlice">
				Cancel ({{ printStore.sliceJob.pct }}%)
			</button>
		</div>
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

.nc-print-slice-summary__estimate {
	border-top: 1px solid var(--nc-gcs-border);
	margin-top: var(--nc-gcs-space-sm);
	padding-top: var(--nc-gcs-space-sm);
}
.nc-print-slice-summary__est-row {
	display: flex;
	justify-content: space-between;
	font-size: var(--nc-gcs-text-sm);
	padding: 2px 0;
}
.nc-print-slice-summary__est-label {
	color: var(--nc-gcs-text-muted);
}
.nc-print-slice-summary__est-value {
	font-variant-numeric: tabular-nums;
	font-weight: 600;
}
.nc-print-slice-summary__est-hint {
	color: var(--nc-gcs-text-muted);
	font-size: 11px;
	margin: 4px 0 0;
}
.nc-print-slice-summary__actions {
	margin-top: var(--nc-gcs-space-sm);
}
.nc-print-slice-summary__actions .nc-print-btn {
	width: 100%;
}
</style>
