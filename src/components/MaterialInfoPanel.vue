<template>
	<div class="mat">
		<h3 class="mat__title">Filament materials</h3>
		<p class="mat__hint">
			Reference temps, drying, plate compatibility and properties for common
			filaments. Pick one to apply its recommended nozzle/bed temps as slice
			overrides.
		</p>

		<p v-if="loadError" class="mat__error">{{ loadError }}</p>
		<p v-else-if="!materials.length" class="mat__hint">Loading materials…</p>

		<template v-else>
			<div class="mat__filters">
				<button
					v-for="cat in categories"
					:key="cat.id"
					type="button"
					class="mat__chip"
					:class="{ 'mat__chip--active': category === cat.id }"
					@click="category = cat.id">
					{{ cat.label }}
				</button>
			</div>

			<div class="mat__grid">
				<button
					v-for="m in filtered"
					:key="m.id"
					type="button"
					class="mat__card"
					:class="{ 'mat__card--active': selected === m.id }"
					@click="selected = m.id">
					<span class="mat__name">{{ m.name }}</span>
					<span class="mat__temps">{{ m.nozzle_temp.recommended }}° / {{ m.bed_temp.recommended }}°</span>
					<span class="mat__cat">{{ m.category }} · {{ m.difficulty }}</span>
				</button>
			</div>

			<div v-if="selectedObj" class="mat__detail">
				<div class="mat__detail-head">
					<div>
						<strong class="mat__detail-name">{{ selectedObj.name }}</strong>
						<span class="mat__detail-full">{{ selectedObj.fullName }}</span>
					</div>
					<button
						type="button"
						class="mat__btn mat__btn--primary"
						@click="applyTemps">
						Use these temps
					</button>
				</div>
				<p v-if="appliedMsg" class="mat__done">{{ appliedMsg }}</p>

				<div class="mat__specs">
					<span class="mat__spec">Nozzle <b>{{ selectedObj.nozzle_temp.recommended }}°C</b> ({{ selectedObj.nozzle_temp.min }}–{{ selectedObj.nozzle_temp.max }})</span>
					<span class="mat__spec">Bed <b>{{ selectedObj.bed_temp.recommended }}°C</b> ({{ selectedObj.bed_temp.min }}–{{ selectedObj.bed_temp.max }})</span>
					<span v-if="selectedObj.chamber_temp" class="mat__spec">Chamber <b>{{ selectedObj.chamber_temp.min }}–{{ selectedObj.chamber_temp.max }}°C</b></span>
					<span class="mat__spec">Speed <b>{{ selectedObj.speed.recommended }} mm/s</b></span>
					<span class="mat__spec">Dry <b>{{ selectedObj.drying.temp }}°C / {{ selectedObj.drying.hours }}h</b> ({{ selectedObj.drying.hygroscopic }})</span>
				</div>

				<div class="mat__flags">
					<span v-if="selectedObj.requires_enclosure" class="mat__flag mat__flag--warn">Enclosure required</span>
					<span v-if="selectedObj.requires_hardened_nozzle" class="mat__flag mat__flag--warn">Hardened nozzle</span>
				</div>

				<div class="mat__props">
					<div v-for="(val, key) in selectedObj.properties" :key="key" class="mat__prop">
						<span class="mat__prop-label">{{ key.replace(/_/g, ' ') }}</span>
						<span class="mat__bar">
							<span class="mat__bar-fill" :style="{ width: (val * 20) + '%' }" />
						</span>
					</div>
				</div>

				<p v-if="selectedObj.tips" class="mat__tip">💡 {{ selectedObj.tips }}</p>
				<p v-if="selectedObj.warnings" class="mat__warn">⚠ {{ selectedObj.warnings }}</p>
			</div>
		</template>
	</div>
</template>

<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { fetchMaterials } from '@/services/materials-api.js'

const CATEGORIES = [
	{ id: '', label: 'All' },
	{ id: 'standard', label: 'Standard' },
	{ id: 'engineering', label: 'Engineering' },
	{ id: 'composite', label: 'Composite' },
	{ id: 'flexible', label: 'Flexible' },
	{ id: 'specialty', label: 'Specialty' },
	{ id: 'support', label: 'Support' },
]

export default {
	name: 'MaterialInfoPanel',
	data() {
		return {
			materials: [],
			categories: CATEGORIES,
			category: '',
			selected: '',
			loadError: '',
			appliedMsg: '',
		}
	},
	computed: {
		...mapStores(usePrintStore),
		filtered() {
			if (!this.category) {
				return this.materials
			}
			return this.materials.filter((m) => m.category === this.category)
		},
		selectedObj() {
			return this.materials.find((m) => m.id === this.selected) || null
		},
	},
	async mounted() {
		try {
			this.materials = await fetchMaterials()
		} catch (e) {
			this.loadError = e?.message || 'Could not load material database'
		}
	},
	methods: {
		applyTemps() {
			if (!this.selectedObj) {
				return
			}
			const ok = this.printStore.applyMaterialTemps(this.selectedObj)
			this.appliedMsg = ok
				? `Applied ${this.selectedObj.nozzle_temp.recommended}°/${this.selectedObj.bed_temp.recommended}° to slice overrides.`
				: 'No temps to apply.'
		},
	},
}
</script>

<style scoped lang="scss">
.mat { display: flex; flex-direction: column; gap: 8px; }
.mat__title { margin: 0; font-size: 0.95rem; }
.mat__hint { margin: 0; font-size: 0.8rem; color: var(--color-text-maxcontrast, #8b949e); }
.mat__filters { display: flex; flex-wrap: wrap; gap: 6px; }
.mat__chip {
	appearance: none; border: 1px solid var(--color-border, #30363d); border-radius: 999px;
	background: var(--color-background-hover, #21262d); color: inherit; padding: 3px 12px;
	font-size: 0.74rem; cursor: pointer;
	&--active { border-color: var(--nc-app-accent, #4c8eda); background: color-mix(in srgb, var(--nc-app-accent, #4c8eda) 18%, transparent); }
}
.mat__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 8px; }
.mat__card {
	display: flex; flex-direction: column; gap: 2px; text-align: left;
	padding: 8px 10px; border: 1px solid var(--color-border, #30363d); border-radius: 8px;
	background: var(--color-background-hover, #21262d); cursor: pointer;
	&--active { border-color: var(--nc-app-accent, #4c8eda); background: color-mix(in srgb, var(--nc-app-accent, #4c8eda) 15%, transparent); }
}
.mat__name { font-weight: 600; font-size: 0.85rem; }
.mat__temps { font-size: 0.78rem; color: var(--color-text-maxcontrast, #8b949e); }
.mat__cat { font-size: 0.68rem; text-transform: capitalize; color: var(--color-text-maxcontrast, #8b949e); }
.mat__detail {
	display: flex; flex-direction: column; gap: 8px;
	padding: 10px; border: 1px solid var(--color-border, #30363d); border-radius: 8px;
	background: var(--color-background-dark, #161b22);
}
.mat__detail-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.mat__detail-name { font-size: 0.95rem; margin-right: 8px; }
.mat__detail-full { font-size: 0.76rem; color: var(--color-text-maxcontrast, #8b949e); }
.mat__specs { display: flex; flex-wrap: wrap; gap: 10px; font-size: 0.76rem; }
.mat__spec { color: var(--color-text-maxcontrast, #8b949e); b { color: inherit; } }
.mat__flags { display: flex; gap: 6px; flex-wrap: wrap; }
.mat__flag { font-size: 0.7rem; padding: 2px 8px; border-radius: 999px; }
.mat__flag--warn { background: color-mix(in srgb, var(--color-warning, #d9a441) 22%, transparent); color: var(--color-warning, #d9a441); }
.mat__props { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 4px 12px; }
.mat__prop { display: flex; align-items: center; gap: 8px; font-size: 0.72rem; }
.mat__prop-label { flex: 0 0 96px; text-transform: capitalize; color: var(--color-text-maxcontrast, #8b949e); }
.mat__bar { flex: 1; height: 6px; border-radius: 3px; background: var(--color-border, #30363d); overflow: hidden; }
.mat__bar-fill { display: block; height: 100%; background: var(--nc-app-accent, #4c8eda); }
.mat__btn {
	appearance: none; border: 1px solid var(--color-border, #30363d); border-radius: 6px;
	background: var(--color-background-hover, #21262d); color: inherit; padding: 6px 14px;
	font-size: 0.82rem; cursor: pointer;
	&--primary { background: color-mix(in srgb, var(--nc-app-accent, #4c8eda) 18%, transparent); border-color: var(--nc-app-accent, #4c8eda); }
}
.mat__tip { margin: 0; font-size: 0.76rem; }
.mat__warn { margin: 0; font-size: 0.76rem; color: var(--color-warning, #d9a441); }
.mat__error { margin: 0; font-size: 0.8rem; color: var(--color-error, #e5534b); }
.mat__done { margin: 0; font-size: 0.8rem; color: var(--color-success, #4caf50); }
</style>
