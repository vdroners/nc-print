<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import ProfileQuickEdit from './ProfileQuickEdit.vue'

export default {
	name: 'PrepareOverrides',
	components: { ProfileQuickEdit },
	data() {
		return {
			presetName: '',
		}
	},
	computed: {
		...mapStores(usePrintStore),
		presetNames() {
			return Object.keys(this.printStore.savedPresets || {}).sort()
		},
	},
	methods: {
		toggle() {
			this.printStore.toggleOverridesCollapsed()
		},
		onOverrideChange() {
			this.printStore.persistOverrides()
		},
		onFilamentImport(e) {
			const file = e.target.files?.[0]
			e.target.value = '' // allow re-importing the same file
			if (!file) {
				return
			}
			const reader = new FileReader()
			reader.onload = () => {
				void this.printStore.importFilamentSettings(String(reader.result || ''))
			}
			reader.onerror = () => {
				this.printStore.importFilamentSettings('') // triggers the error toast path
			}
			reader.readAsText(file)
		},
		savePreset() {
			if (this.printStore.saveOverridePreset(this.presetName)) {
				this.presetName = ''
			}
		},
		loadPreset(name) {
			if (name) {
				this.printStore.loadOverridePreset(name)
			}
		},
	},
}
</script>

<template>
	<div class="nc-print-card">
		<button
			type="button"
			class="nc-print-overrides-toggle"
			@click="toggle">
			Override settings (advanced)
			<span>{{ printStore.overridesCollapsed ? '▸' : '▾' }}</span>
		</button>
		<p v-if="printStore.overridesCollapsed" class="nc-print-overrides-hint">
			Layer height, speeds, temps — pre-filled from your selected quality profile.
		</p>
		<div v-show="!printStore.overridesCollapsed">
			<div class="nc-print-overrides-grid">
				<div class="nc-print-field">
					<label>Layer height (mm)</label>
					<input v-model="printStore.overrides.layerHeight" type="number" step="0.01" min="0" @change="onOverrideChange">
				</div>
				<div class="nc-print-field">
					<label>Line width (mm)</label>
					<input v-model="printStore.overrides.lineWidth" type="number" step="0.01" min="0" @change="onOverrideChange">
				</div>
				<div class="nc-print-field">
					<label>Perimeters</label>
					<input v-model="printStore.overrides.perimeters" type="number" step="1" min="0" @change="onOverrideChange">
				</div>
				<div class="nc-print-field">
					<label>Infill density (%)</label>
					<input v-model="printStore.overrides.infillDensity" type="number" step="1" min="0" max="100" @change="onOverrideChange">
				</div>
				<div class="nc-print-field">
					<label>Print speed (mm/s)</label>
					<input v-model="printStore.overrides.printSpeed" type="number" step="1" min="0" @change="onOverrideChange">
				</div>
				<div class="nc-print-field">
					<label>First layer speed (mm/s)</label>
					<input v-model="printStore.overrides.firstLayerSpeed" type="number" step="1" min="0" @change="onOverrideChange">
				</div>
				<div class="nc-print-field">
					<label>Nozzle temp (°C)</label>
					<input v-model="printStore.overrides.nozzleTemp" type="number" step="1" @change="onOverrideChange">
				</div>
				<div class="nc-print-field">
					<label>Bed temp (°C)</label>
					<input v-model="printStore.overrides.bedTemp" type="number" step="1" @change="onOverrideChange">
				</div>
			</div>

			<ProfileQuickEdit @change="onOverrideChange" />

			<div class="nc-print-preset-row">
				<div class="nc-print-field nc-print-preset-row__save">
					<label>Save preset</label>
					<div class="nc-print-preset-row__controls">
						<input v-model="presetName" type="text" placeholder="My quality preset">
						<button type="button" class="nc-print-btn" @click="savePreset">Save</button>
					</div>
				</div>
				<div v-if="presetNames.length" class="nc-print-field">
					<label for="nc-print-load-preset">Load preset</label>
					<select id="nc-print-load-preset" @change="loadPreset($event.target.value); $event.target.value = ''">
						<option value="">Choose saved preset…</option>
						<option v-for="name in presetNames" :key="name" :value="name">{{ name }}</option>
					</select>
				</div>
			</div>

			<div class="nc-print-field nc-print-overrides-import">
				<label>Import filament settings</label>
				<label class="nc-print-btn nc-print-btn--sm">
					Import .json…
					<input
						ref="filamentImport"
						type="file"
						accept=".json,application/json"
						hidden
						@change="onFilamentImport">
				</label>
				<span class="nc-print-overrides-import__hint">
					OrcaSlicer / Bambu filament preset — temps, fan, retraction.
				</span>
			</div>
		</div>
	</div>
</template>

<style scoped>
.nc-print-overrides-hint {
	color: var(--nc-gcs-text-muted);
	font-size: var(--nc-gcs-text-sm);
	margin: 0 0 var(--nc-gcs-space-sm);
}

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
	text-align: left;
	width: 100%;
}

.nc-print-overrides-grid {
	display: grid;
	gap: var(--nc-gcs-space-sm);
	grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
	margin-top: var(--nc-gcs-space-sm);
}

.nc-print-preset-row {
	border-top: 1px solid var(--nc-gcs-border);
	display: grid;
	gap: var(--nc-gcs-space-sm);
	grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
	margin-top: var(--nc-gcs-space-md);
	padding-top: var(--nc-gcs-space-md);
}

.nc-print-preset-row__controls {
	display: flex;
	gap: var(--nc-gcs-space-sm);
}

.nc-print-preset-row__controls input {
	flex: 1 1 auto;
}

.nc-print-preset-row__save {
	margin-bottom: 0;
}
</style>
