<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { previewUrl } from '@/services/slicer-api.js'

export default {
	name: 'SliceTab',
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
	},
	methods: {
		async onSlice() {
			this.abortController = new AbortController()
			try {
				await this.printStore.runSlice({ signal: this.abortController.signal })
			} catch (e) {
				if (e?.name !== 'AbortError') {
					console.warn('[nc_print] slice failed:', e?.message || e)
				}
			} finally {
				this.abortController = null
			}
		},
		cancelSlice() {
			this.abortController?.abort()
		},
		async onSliceAndStart() {
			this.abortController = new AbortController()
			try {
				await this.printStore.sliceAndMaybeStart({ signal: this.abortController.signal })
			} catch (e) {
				if (e?.name !== 'AbortError') {
					console.warn('[nc_print] slice+start failed:', e?.message || e)
				}
			} finally {
				this.abortController = null
			}
		},
		downloadGcode() {
			this.printStore.downloadGcodeLocal()
		},
	},
}
</script>

<template>
	<div class="nc-print-slice">
		<div v-if="!printStore.hasModel" class="nc-print-card">
			<p>No model loaded — go to <strong>Prepare</strong> first.</p>
		</div>

		<template v-else>
			<div class="nc-print-row">
				<div class="nc-print-card" style="flex: 1 1 280px;">
					<h2 class="nc-print-card__title">Profiles</h2>
					<div class="nc-print-field">
						<label for="nc-print-printer">Printer</label>
						<select id="nc-print-printer" v-model="printStore.selection.printerId">
							<option v-for="p in printStore.profiles.printers" :key="p.id" :value="p.id">
								{{ p.name || p.id }}
							</option>
						</select>
					</div>
					<div class="nc-print-field">
						<label for="nc-print-filament">Filament</label>
						<select id="nc-print-filament" v-model="printStore.selection.filamentId">
							<option v-for="f in printStore.profiles.filaments" :key="f.id" :value="f.id">
								{{ f.name || f.id }}
							</option>
						</select>
					</div>
					<div class="nc-print-field">
						<label for="nc-print-process">Process / quality</label>
						<select id="nc-print-process" v-model="printStore.selection.processId">
							<option v-for="p in printStore.profiles.processes" :key="p.id" :value="p.id">
								{{ p.name || p.id }}
							</option>
						</select>
					</div>
				</div>

				<div class="nc-print-card" style="flex: 1 1 280px;">
					<h2 class="nc-print-card__title">Overrides</h2>
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
				<p v-if="printStore.sliceJob.status === 'done'" style="color: var(--nc-app-accent);">
					Slice complete
					<span v-if="printStore.sliceJob.estimatedTimeS">
						· ~{{ Math.round(printStore.sliceJob.estimatedTimeS / 60) }} min
					</span>
				</p>

				<label style="display: flex; align-items: center; gap: 8px; margin-top: 12px; font-size: var(--nc-gcs-text-sm);">
					<input v-model="printStore.uploadAndStart" type="checkbox">
					Upload to printer and start after slice
				</label>

				<div class="nc-print-actions">
					<button
						type="button"
						class="nc-print-btn nc-print-btn--primary"
						:disabled="slicing"
						@click="onSlice">
						Slice
					</button>
					<button
						type="button"
						class="nc-print-btn nc-print-btn--primary"
						:disabled="slicing"
						@click="onSliceAndStart">
						Slice &amp; start
					</button>
					<button
						v-if="slicing"
						type="button"
						class="nc-print-btn nc-print-btn--danger"
						@click="cancelSlice">
						Cancel
					</button>
					<button
						v-if="printStore.sliceJob.gcodeBlob"
						type="button"
						class="nc-print-btn"
						@click="downloadGcode">
						Download G-code
					</button>
				</div>
			</div>

			<div v-if="previewImageUrl && printStore.sliceJob.status === 'done'" class="nc-print-card">
				<h2 class="nc-print-card__title">Preview</h2>
				<img
					:src="previewImageUrl"
					alt="Slice preview"
					style="max-width: 100%; border-radius: var(--nc-gcs-radius-sm);">
			</div>
		</template>
	</div>
</template>
