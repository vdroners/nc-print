<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { QUALITY_TIERS, isOverrideModified } from '@/services/slicer-utils.js'
import ProfileQuickEdit from './ProfileQuickEdit.vue'

export default {
	name: 'PrepareOverrides',
	components: { ProfileQuickEdit },
	data() {
		return {
			presetName: '',
			qualityTiers: QUALITY_TIERS,
		}
	},
	computed: {
		...mapStores(usePrintStore),
		presetNames() {
			return Object.keys(this.printStore.savedPresets || {}).sort()
		},
		anyModified() {
			const b = this.printStore.overrideDefaults
			return Object.keys(this.printStore.overrides).some((k) => isOverrideModified(k, this.printStore.overrides, b))
		},
		activeTier() {
			const lh = Number(this.printStore.overrides.layerHeight)
			const t = this.qualityTiers.find((q) => Math.abs(q.layerHeight - lh) < 0.001)
			return t ? t.id : ''
		},
	},
	methods: {
		toggle() {
			this.printStore.toggleOverridesCollapsed()
		},
		onOverrideChange() {
			this.printStore.persistOverrides()
		},
		isModified(key) {
			return isOverrideModified(key, this.printStore.overrides, this.printStore.overrideDefaults)
		},
		resetField(key) {
			this.printStore.resetOverrideField(key)
		},
		resetAll() {
			this.printStore.resetAllOverrides()
		},
		setTier(layerHeight) {
			this.printStore.setQualityTier(layerHeight)
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
		<!-- Quality tier — lead with a one-click quality pick like Cura/Orca. -->
		<div class="nc-print-quality-row">
			<span class="nc-print-quality-row__label">Quality</span>
			<div class="nc-print-quality-row__tiers">
				<button
					v-for="t in qualityTiers"
					:key="t.id"
					type="button"
					class="nc-print-btn nc-print-btn--sm"
					:class="{ 'nc-print-btn--active': activeTier === t.id }"
					:title="`Layer height ${t.layerHeight} mm`"
					@click="setTier(t.layerHeight)">
					{{ t.label }}
				</button>
			</div>
		</div>

		<button
			type="button"
			class="nc-print-overrides-toggle"
			@click="toggle">
			Override settings (advanced)<span v-if="anyModified" class="nc-print-overrides-toggle__dot" title="Modified from profile">●</span>
			<span>{{ printStore.overridesCollapsed ? '▸' : '▾' }}</span>
		</button>
		<p v-if="printStore.overridesCollapsed" class="nc-print-overrides-hint">
			Layer height, speeds, temps — pre-filled from your selected quality profile.
		</p>
		<div v-show="!printStore.overridesCollapsed">
			<div class="nc-print-overrides-actions">
				<button type="button" class="nc-print-link-btn" :disabled="!anyModified" @click="resetAll">
					Reset all to profile
				</button>
			</div>
			<div class="nc-print-overrides-grid">
				<div class="nc-print-field" :class="{ 'is-modified': isModified('layerHeight') }">
					<label>Layer height (mm) <button v-if="isModified('layerHeight')" type="button" class="nc-print-reset" title="Reset to profile" @click="resetField('layerHeight')">⟲</button></label>
					<input v-model="printStore.overrides.layerHeight" type="number" step="0.01" min="0" @change="onOverrideChange">
				</div>
				<div class="nc-print-field" :class="{ 'is-modified': isModified('lineWidth') }">
					<label>Line width (mm) <button v-if="isModified('lineWidth')" type="button" class="nc-print-reset" title="Reset to profile" @click="resetField('lineWidth')">⟲</button></label>
					<input v-model="printStore.overrides.lineWidth" type="number" step="0.01" min="0" @change="onOverrideChange">
				</div>
				<div class="nc-print-field" :class="{ 'is-modified': isModified('perimeters') }">
					<label>Perimeters <button v-if="isModified('perimeters')" type="button" class="nc-print-reset" title="Reset to profile" @click="resetField('perimeters')">⟲</button></label>
					<input v-model="printStore.overrides.perimeters" type="number" step="1" min="0" @change="onOverrideChange">
				</div>
				<div class="nc-print-field" :class="{ 'is-modified': isModified('infillDensity') }">
					<label>Infill density (%) <button v-if="isModified('infillDensity')" type="button" class="nc-print-reset" title="Reset to profile" @click="resetField('infillDensity')">⟲</button></label>
					<input v-model="printStore.overrides.infillDensity" type="number" step="1" min="0" max="100" @change="onOverrideChange">
				</div>
				<div class="nc-print-field" :class="{ 'is-modified': isModified('printSpeed') }">
					<label>Print speed (mm/s) <button v-if="isModified('printSpeed')" type="button" class="nc-print-reset" title="Reset to profile" @click="resetField('printSpeed')">⟲</button></label>
					<input v-model="printStore.overrides.printSpeed" type="number" step="1" min="0" @change="onOverrideChange">
				</div>
				<div class="nc-print-field" :class="{ 'is-modified': isModified('firstLayerSpeed') }">
					<label>First layer speed (mm/s) <button v-if="isModified('firstLayerSpeed')" type="button" class="nc-print-reset" title="Reset to profile" @click="resetField('firstLayerSpeed')">⟲</button></label>
					<input v-model="printStore.overrides.firstLayerSpeed" type="number" step="1" min="0" @change="onOverrideChange">
				</div>
				<div class="nc-print-field" :class="{ 'is-modified': isModified('nozzleTemp') }">
					<label>Nozzle temp (°C) <button v-if="isModified('nozzleTemp')" type="button" class="nc-print-reset" title="Reset to profile" @click="resetField('nozzleTemp')">⟲</button></label>
					<input v-model="printStore.overrides.nozzleTemp" type="number" step="1" @change="onOverrideChange">
				</div>
				<div class="nc-print-field" :class="{ 'is-modified': isModified('bedTemp') }">
					<label>Bed temp (°C) <button v-if="isModified('bedTemp')" type="button" class="nc-print-reset" title="Reset to profile" @click="resetField('bedTemp')">⟲</button></label>
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

/* Quality tier row */
.nc-print-quality-row {
	align-items: center;
	display: flex;
	gap: var(--nc-gcs-space-sm);
	margin-bottom: var(--nc-gcs-space-sm);
	padding-bottom: var(--nc-gcs-space-sm);
	border-bottom: 1px solid var(--nc-gcs-border);
}
.nc-print-quality-row__label {
	color: var(--nc-gcs-text-muted);
	font-size: var(--nc-gcs-text-sm);
	font-weight: 600;
}
.nc-print-quality-row__tiers {
	display: flex;
	gap: 4px;
}
:deep(.nc-print-btn--active) {
	background: color-mix(in srgb, var(--nc-app-accent) 15%, transparent);
	border-color: var(--nc-app-accent);
	color: var(--nc-app-accent);
	font-weight: 600;
}

/* Modified-value highlight + reset affordance */
.nc-print-overrides-toggle__dot {
	color: var(--nc-app-accent);
	font-size: 10px;
	margin-left: 6px;
	vertical-align: middle;
}
.nc-print-overrides-actions {
	display: flex;
	justify-content: flex-end;
	margin-top: var(--nc-gcs-space-sm);
}
.nc-print-field.is-modified label {
	color: var(--nc-app-accent);
	font-weight: 600;
}
.nc-print-field.is-modified input,
.nc-print-field.is-modified select {
	border-color: color-mix(in srgb, var(--nc-app-accent) 55%, var(--nc-gcs-border));
}
.nc-print-reset {
	appearance: none;
	background: transparent;
	border: none;
	color: var(--nc-app-accent);
	cursor: pointer;
	font-size: 12px;
	line-height: 1;
	padding: 0 2px;
}
.nc-print-link-btn {
	appearance: none;
	background: none;
	border: none;
	color: var(--nc-app-accent);
	cursor: pointer;
	font: inherit;
	font-size: var(--nc-gcs-text-sm);
	text-decoration: underline;
}
.nc-print-link-btn:disabled {
	color: var(--nc-gcs-text-muted);
	cursor: default;
	text-decoration: none;
}
</style>
