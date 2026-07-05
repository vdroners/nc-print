<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { formatPrintTime, mergeProfileSettings, estimateFilamentCost, resolveFilamentPricePerKg } from '@/services/slicer-utils.js'
import { lintGcode } from '@/services/analysis-api.js'
import { toastError } from '@/services/toast.js'

export default {
	name: 'SliceResultPanel',
	props: {
		embedded: { type: Boolean, default: false },
	},
	data() {
		return {
			lint: null,       // { issues, stats } | null
			lintBusy: false,
			lintOpen: false,
			lintedJobId: null,
		}
	},
	watch: {
		// Lint automatically once a slice completes (new job id).
		'job.jobId': {
			immediate: true,
			handler(jobId) {
				if (jobId && this.job.status === 'done' && jobId !== this.lintedJobId) {
					this.runLint(jobId)
				}
			},
		},
	},
	computed: {
		...mapStores(usePrintStore),
		job() {
			return this.printStore.sliceJob
		},
		show() {
			return this.job.status === 'done'
		},
		lintCounts() {
			const c = { error: 0, warning: 0, info: 0 }
			for (const i of (this.lint?.issues || [])) {
				if (c[i.severity] != null) {
					c[i.severity]++
				}
			}
			return c
		},
		hasLintIssues() {
			return (this.lint?.issues?.length || 0) > 0
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
		async runLint(jobId) {
			const id = jobId || this.job.jobId
			if (!id) {
				return
			}
			this.lintBusy = true
			try {
				this.lint = await lintGcode({ jobId: id })
				this.lintedJobId = id
			} catch (e) {
				this.lint = null
				toastError('G-code lint check failed', e)
			} finally {
				this.lintBusy = false
			}
		},
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

		<div v-if="lintBusy || lint" class="nc-print-slice-result__checks">
			<button
				type="button"
				class="nc-print-slice-result__checks-head"
				:aria-expanded="String(lintOpen)"
				@click="lintOpen = !lintOpen">
				<span>G-code checks</span>
				<span v-if="lintBusy" class="nc-print-slice-result__checks-muted">checking…</span>
				<span v-else-if="!hasLintIssues" class="nc-print-slice-result__checks-ok">✓ no issues</span>
				<span v-else class="nc-print-slice-result__checks-badges">
					<span v-if="lintCounts.error" class="nc-print-chk nc-print-chk--error">{{ lintCounts.error }} error</span>
					<span v-if="lintCounts.warning" class="nc-print-chk nc-print-chk--warn">{{ lintCounts.warning }} warn</span>
					<span v-if="lintCounts.info" class="nc-print-chk nc-print-chk--info">{{ lintCounts.info }} info</span>
				</span>
			</button>
			<ul v-if="lintOpen && hasLintIssues" class="nc-print-slice-result__checks-list">
				<li
					v-for="(iss, idx) in lint.issues"
					:key="idx"
					class="nc-print-chk-row"
					:class="'nc-print-chk-row--' + iss.severity">
					<span class="nc-print-chk-row__sev">{{ iss.severity }}</span>
					<span class="nc-print-chk-row__msg">{{ iss.message }}<span v-if="iss.line" class="nc-print-chk-row__line"> (line {{ iss.line }})</span></span>
				</li>
			</ul>
		</div>

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

.nc-print-slice-result__checks {
	margin-top: 8px;
	border: 1px solid var(--color-border, #30363d);
	border-radius: 8px;
	overflow: hidden;
}
.nc-print-slice-result__checks-head {
	width: 100%;
	display: flex;
	align-items: center;
	gap: 10px;
	justify-content: space-between;
	appearance: none;
	background: var(--color-background-hover, #21262d);
	border: none;
	color: inherit;
	padding: 8px 10px;
	font-size: 0.82rem;
	cursor: pointer;
	text-align: left;
}
.nc-print-slice-result__checks-ok { color: var(--color-success, #4caf50); font-size: 0.78rem; }
.nc-print-slice-result__checks-muted { color: var(--color-text-maxcontrast, #8b949e); font-size: 0.78rem; }
.nc-print-slice-result__checks-badges { display: inline-flex; gap: 6px; }
.nc-print-chk { font-size: 0.68rem; padding: 1px 7px; border-radius: 999px; }
.nc-print-chk--error { background: color-mix(in srgb, var(--color-error, #e5534b) 22%, transparent); color: var(--color-error, #e5534b); }
.nc-print-chk--warn { background: color-mix(in srgb, var(--color-warning, #d9a441) 22%, transparent); color: var(--color-warning, #d9a441); }
.nc-print-chk--info { background: color-mix(in srgb, var(--color-primary, #4c8eda) 18%, transparent); color: var(--color-primary, #4c8eda); }
.nc-print-slice-result__checks-list { list-style: none; margin: 0; padding: 6px 10px; display: flex; flex-direction: column; gap: 5px; }
.nc-print-chk-row { display: flex; gap: 8px; font-size: 0.78rem; align-items: baseline; }
.nc-print-chk-row__sev { flex: 0 0 52px; text-transform: uppercase; font-size: 0.62rem; padding-top: 2px; }
.nc-print-chk-row--error .nc-print-chk-row__sev { color: var(--color-error, #e5534b); }
.nc-print-chk-row--warning .nc-print-chk-row__sev { color: var(--color-warning, #d9a441); }
.nc-print-chk-row--info .nc-print-chk-row__sev { color: var(--color-text-maxcontrast, #8b949e); }
.nc-print-chk-row__line { color: var(--color-text-maxcontrast, #8b949e); }

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
