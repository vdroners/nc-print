<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { formatPrintTime, mergeProfileSettings, estimateFilamentCost, resolveFilamentPricePerKg } from '@/services/slicer-utils.js'

export default {
	name: 'SliceResultPanel',
	props: {
		embedded: { type: Boolean, default: false },
	},
	computed: {
		...mapStores(usePrintStore),
		job() {
			return this.printStore.sliceJob
		},
		show() {
			return this.job.status === 'done'
		},
		printTimeLabel() {
			return formatPrintTime(this.job.estimatedTimeS)
		},
		etaPrediction() {
			return this.printStore.etaPrediction
		},
		etaPredictedLabel() {
			const p = this.etaPrediction
			if (!p || !(p.predicted_minutes > 0)) {
				return null
			}
			return formatPrintTime(Math.round(p.predicted_minutes * 60))
		},
		etaConfidenceLabel() {
			const p = this.etaPrediction
			if (!p) {
				return ''
			}
			const pct = Math.round((p.confidence || 0) * 100)
			const sign = p.multiplier >= 1 ? '+' : '−'
			const deltaPct = Math.abs(Math.round((p.multiplier - 1) * 100))
			return `${sign}${deltaPct}% vs slicer · ${p.samples} prints · ${pct}% confidence`
		},
		gcodeKb() {
			if (!this.job.gcodeSizeBytes) {
				return null
			}
			return (this.job.gcodeSizeBytes / 1024).toFixed(1)
		},
		filamentBreakdown() {
			const rows = this.job.filamentBreakdown || []
			if (!rows.length) {
				return []
			}
			if (rows.length === 1) {
				return []
			}
			return rows.map((grams, index) => ({
				tool: index + 1,
				grams: Number(grams) || 0,
			}))
		},
		filamentBreakdownTotal() {
			if (!this.filamentBreakdown.length) {
				return this.job.filamentUsedG
			}
			return this.filamentBreakdown.reduce((sum, row) => sum + row.grams, 0)
		},
		materialStats() {
			return this.job.materialStats || {}
		},
		hasMaterialStats() {
			const s = this.materialStats
			return s.supportFilamentG != null
				|| s.supportTimeS != null
				|| s.modelFilamentG != null
				|| s.supportFilamentUsedG != null
		},
		canSaveToFiles() {
			return !!this.job.gcodeBlob
				&& (this.printStore.model.fileId || this.printStore.model.davPath)
		},
		savingGcode() {
			return this.printStore.savingGcode
		},
		filamentPricePerKg() {
			const filament = (this.printStore.profiles.filaments || [])
				.find(f => String(f.id) === String(this.printStore.selection.filamentId))
			const settings = filament?.settings_json
				? (typeof filament.settings_json === 'object'
					? filament.settings_json
					: (() => {
						try {
							return JSON.parse(filament.settings_json)
						} catch {
							return {}
						}
					})())
				: {}
			return resolveFilamentPricePerKg(this.printStore.config, settings)
		},
		filamentCostEstimate() {
			return estimateFilamentCost(this.filamentBreakdownTotal, this.filamentPricePerKg)
		},
		filamentCostLabel() {
			if (this.filamentCostEstimate == null) {
				return null
			}
			return `$${this.filamentCostEstimate.toFixed(2)}`
		},
		/**
		 * Per-feature weight (and cost when a price is set) breakdown for the
		 * result summary: model / support / adhesion. Only categories with a
		 * positive gram figure are shown.
		 */
		featureBreakdown() {
			const s = this.materialStats
			const price = this.filamentPricePerKg
			const rows = [
				{ key: 'model', label: 'Model', g: s.modelFilamentG },
				{ key: 'support', label: 'Support', g: s.supportFilamentG ?? s.supportFilamentUsedG },
				{ key: 'adhesion', label: 'Brim / skirt', g: s.adhesionFilamentG },
			]
			return rows
				.filter(r => r.g != null && Number(r.g) > 0)
				.map(r => {
					const grams = Number(r.g)
					const cost = estimateFilamentCost(grams, price)
					return {
						...r,
						grams,
						costLabel: cost != null ? `$${cost.toFixed(2)}` : null,
					}
				})
		},
		hasFeatureBreakdown() {
			return this.featureBreakdown.length > 1
		},
	},
	methods: {
		formatPrintTime,
		download() {
			this.printStore.downloadGcodeLocal()
		},
		retryDownload() {
			void this.printStore.retryDownloadGcode()
		},
		saveToFiles() {
			void this.printStore.saveGcodeToFiles()
		},
	},
}
</script>

<template>
	<div
		v-if="show"
		:class="embedded ? 'nc-print-slice-result--embedded' : 'nc-print-card nc-print-slice-result'">
		<h2 v-if="!embedded" class="nc-print-card__title">Slice result</h2>
		<dl class="nc-print-slice-result__list">
			<div v-if="job.layers > 0">
				<dt>Layers</dt>
				<dd>{{ job.layers }}</dd>
			</div>
			<div>
				<dt>Print time</dt>
				<dd>{{ printTimeLabel }}</dd>
			</div>
			<div v-if="etaPredictedLabel" class="nc-print-slice-result__eta">
				<dt>Predicted <span class="nc-print-slice-result__eta-tag">learned</span></dt>
				<dd>
					{{ etaPredictedLabel }}
					<span class="nc-print-slice-result__eta-note">{{ etaConfidenceLabel }}</span>
				</dd>
			</div>
			<div>
				<dt>Filament</dt>
				<dd>{{ filamentBreakdownTotal.toFixed(2) }} g</dd>
			</div>
			<div v-if="filamentCostLabel">
				<dt>Est. material cost</dt>
				<dd>{{ filamentCostLabel }}</dd>
			</div>
			<template v-if="filamentBreakdown.length">
				<div
					v-for="row in filamentBreakdown"
					:key="'tool-' + row.tool"
					class="nc-print-slice-result__tool-row">
					<dt>Tool {{ row.tool }}</dt>
					<dd>{{ row.grams.toFixed(2) }} g</dd>
				</div>
			</template>
			<template v-if="hasFeatureBreakdown">
				<div
					v-for="row in featureBreakdown"
					:key="'feat-' + row.key"
					class="nc-print-slice-result__feat-row">
					<dt>{{ row.label }} filament</dt>
					<dd>{{ row.grams.toFixed(2) }} g<span v-if="row.costLabel" class="nc-print-slice-result__feat-cost"> · {{ row.costLabel }}</span></dd>
				</div>
				<div v-if="materialStats.supportTimeS != null">
					<dt>Support time</dt>
					<dd>{{ formatPrintTime(materialStats.supportTimeS) }}</dd>
				</div>
			</template>
			<template v-else-if="hasMaterialStats">
				<div v-if="materialStats.modelFilamentG != null">
					<dt>Model filament</dt>
					<dd>{{ Number(materialStats.modelFilamentG).toFixed(2) }} g</dd>
				</div>
				<div v-if="materialStats.supportFilamentG != null || materialStats.supportFilamentUsedG != null">
					<dt>Support filament</dt>
					<dd>{{ Number(materialStats.supportFilamentG ?? materialStats.supportFilamentUsedG).toFixed(2) }} g</dd>
				</div>
				<div v-if="materialStats.supportTimeS != null">
					<dt>Support time</dt>
					<dd>{{ formatPrintTime(materialStats.supportTimeS) }}</dd>
				</div>
			</template>
			<div v-if="gcodeKb">
				<dt>G-code</dt>
				<dd>{{ gcodeKb }} KB</dd>
			</div>
			<div>
				<dt>Backend</dt>
				<dd>{{ job.backendLabel }}</dd>
			</div>
			<div v-if="job.sentTo">
				<dt>Sent to</dt>
				<dd>{{ job.sentTo }}{{ job.printing ? ' (printing)' : '' }}</dd>
			</div>
			<div v-if="job.savedDavPath">
				<dt>Saved to Files</dt>
				<dd>{{ job.savedDavPath }}</dd>
			</div>
		</dl>
		<p
			v-if="job.error && !job.gcodeBlob"
			style="font-size: var(--nc-gcs-text-sm); color: var(--nc-gcs-warning, #eab308); margin: 8px 0 0;">
			{{ job.error }}
		</p>
		<div class="nc-print-slice-result__actions">
			<button
				v-if="job.gcodeBlob"
				type="button"
				class="nc-print-btn"
				@click="download">
				Download G-code
			</button>
			<button
				v-if="canSaveToFiles"
				type="button"
				class="nc-print-btn"
				:disabled="savingGcode"
				@click="saveToFiles">
				{{ savingGcode ? 'Saving…' : 'Save to Files' }}
			</button>
			<button
				v-else-if="job.jobId"
				type="button"
				class="nc-print-btn"
				@click="retryDownload">
				Retry download
			</button>
		</div>
		<p
			v-if="job.gcodeBlob && !canSaveToFiles"
			class="nc-print-slice-result__save-hint">
			Import the model from Nextcloud Files to enable Save to Files.
		</p>
	</div>
</template>

<style scoped>
.nc-print-slice-result__tool-row dt {
	padding-left: 12px;
}

.nc-print-slice-result__actions {
	display: flex;
	flex-direction: column;
	gap: 8px;
	margin-top: 8px;
}

.nc-print-slice-result__actions .nc-print-btn {
	width: 100%;
}

.nc-print-slice-result__save-hint {
	color: var(--nc-gcs-text-muted);
	font-size: var(--nc-gcs-text-sm);
	margin: 8px 0 0;
}

.nc-print-slice-result--embedded .nc-print-slice-result__list {
	margin: 0;
}

.nc-print-slice-result__feat-cost {
	color: var(--nc-gcs-text-muted, #8b949e);
}

.nc-print-slice-result__eta-tag {
	display: inline-block;
	margin-left: 6px;
	padding: 0 6px;
	border-radius: 999px;
	font-size: 0.62rem;
	text-transform: uppercase;
	letter-spacing: 0.03em;
	background: color-mix(in srgb, var(--nc-app-accent, #4c8eda) 22%, transparent);
	color: var(--nc-app-accent, #4c8eda);
	vertical-align: middle;
}

.nc-print-slice-result__eta-note {
	display: block;
	color: var(--nc-gcs-text-muted, #8b949e);
	font-size: var(--nc-gcs-text-sm, 0.75rem);
}
</style>
