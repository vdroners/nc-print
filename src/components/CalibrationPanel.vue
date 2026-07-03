<template>
	<div class="calib">
		<h3 class="calib__title">Calibration prints</h3>
		<p class="calib__hint">One-click calibration models sliced for the selected printer.</p>

		<p v-if="loadError" class="calib__error">{{ loadError }}</p>
		<p v-else-if="!calibrations.length" class="calib__hint">Loading catalog…</p>

		<div v-else class="calib__grid">
			<button
				v-for="c in calibrations"
				:key="c.id"
				type="button"
				class="calib__card"
				:class="{ 'calib__card--active': selected === c.id }"
				@click="selected = c.id">
				<span class="calib__name">{{ c.name }}</span>
				<span class="calib__kind">{{ c.kind }}</span>
				<span class="calib__help">{{ c.help }}</span>
			</button>
		</div>

		<div v-if="selectedObj && selectedObj.kind === 'parametric'" class="calib__params">
			<label class="calib__param">
				Start °C
				<input v-model.number="params.temp_start" type="number" min="150" max="320">
			</label>
			<label class="calib__param">
				End °C
				<input v-model.number="params.temp_end" type="number" min="150" max="320">
			</label>
			<label class="calib__param">
				Step °C
				<input v-model.number="params.step" type="number" min="1" max="20">
			</label>
		</div>

		<div class="calib__actions">
			<button
				type="button"
				class="calib__btn calib__btn--primary"
				:disabled="busy || !selected || !printerReady"
				@click="slice">
				{{ busy ? progressLabel : 'Slice calibration' }}
			</button>
			<span v-if="!printerReady" class="calib__warn">Select a printer profile on Prepare first.</span>
		</div>

		<p v-if="error" class="calib__error">{{ error }}</p>
		<p v-if="doneMsg" class="calib__done">{{ doneMsg }}</p>
	</div>
</template>

<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { fetchCalibrations, sliceCalibration } from '@/services/calibration-api.js'

export default {
	name: 'CalibrationPanel',
	data() {
		return {
			calibrations: [],
			selected: '',
			params: { temp_start: 220, temp_end: 190, step: 5 },
			busy: false,
			progressLabel: 'Slicing…',
			error: '',
			loadError: '',
			doneMsg: '',
		}
	},
	computed: {
		...mapStores(usePrintStore),
		selectedObj() {
			return this.calibrations.find((c) => c.id === this.selected) || null
		},
		printerReady() {
			return !!this.printStore.selection?.printerId
		},
	},
	async mounted() {
		try {
			this.calibrations = await fetchCalibrations()
		} catch (e) {
			this.loadError = e?.message || 'Could not load calibration catalog'
		}
	},
	methods: {
		async slice() {
			if (!this.selected || !this.printerReady) {
				return
			}
			this.busy = true
			this.error = ''
			this.doneMsg = ''
			this.progressLabel = 'Preparing…'
			try {
				const sel = this.printStore.selection || {}
				const done = await sliceCalibration({
					calibId: this.selected,
					printerId: sel.printerId,
					processId: sel.processId || '',
					filamentIds: sel.filamentId ? [sel.filamentId] : [],
					params: this.selectedObj?.kind === 'parametric' ? this.params : null,
					onEvent: (ev) => {
						if (ev.event === 'progress' && ev.parsed) {
							this.progressLabel = `${ev.parsed.stage || 'slicing'} ${Math.round(ev.parsed.pct ?? 0)}%`
						}
					},
				})
				await this.printStore.applyArrangedSliceResult?.(done)
				this.doneMsg = `Calibration sliced — open the Slice results to preview or send.`
				this.$emit('sliced', done)
			} catch (e) {
				this.error = e?.message || 'Calibration slice failed'
			} finally {
				this.busy = false
			}
		},
	},
}
</script>

<style scoped lang="scss">
.calib { display: flex; flex-direction: column; gap: 8px; }
.calib__title { margin: 0; font-size: 0.95rem; }
.calib__hint { margin: 0; font-size: 0.8rem; color: var(--color-text-maxcontrast, #8b949e); }
.calib__grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
	gap: 8px;
}
.calib__card {
	display: flex;
	flex-direction: column;
	gap: 2px;
	text-align: left;
	padding: 8px 10px;
	border: 1px solid var(--color-border, #30363d);
	border-radius: 8px;
	background: var(--color-background-hover, #21262d);
	cursor: pointer;
	&--active {
		border-color: var(--nc-app-accent, #4c8eda);
		background: color-mix(in srgb, var(--nc-app-accent, #4c8eda) 15%, transparent);
	}
}
.calib__name { font-weight: 600; font-size: 0.85rem; }
.calib__kind { font-size: 0.68rem; text-transform: uppercase; color: var(--color-text-maxcontrast, #8b949e); }
.calib__help { font-size: 0.74rem; color: var(--color-text-maxcontrast, #8b949e); }
.calib__params { display: flex; flex-wrap: wrap; gap: 10px; }
.calib__param { display: flex; flex-direction: column; font-size: 0.75rem; gap: 2px; }
.calib__param input { width: 84px; }
.calib__actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.calib__btn {
	appearance: none; border: 1px solid var(--color-border, #30363d); border-radius: 6px;
	background: var(--color-background-hover, #21262d); color: inherit; padding: 6px 14px;
	font-size: 0.82rem; cursor: pointer;
	&:disabled { opacity: 0.5; cursor: default; }
	&--primary {
		background: color-mix(in srgb, var(--nc-app-accent, #4c8eda) 18%, transparent);
		border-color: var(--nc-app-accent, #4c8eda);
	}
}
.calib__warn { font-size: 0.75rem; color: var(--color-warning, #d9a441); }
.calib__error { margin: 0; font-size: 0.8rem; color: var(--color-error, #e5534b); }
.calib__done { margin: 0; font-size: 0.8rem; color: var(--color-success, #4caf50); }
</style>
