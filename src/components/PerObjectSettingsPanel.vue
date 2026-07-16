<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { groupsForMode } from '@/services/slicer-utils.js'
import OverrideField from './OverrideField.vue'

// Filament-scoped keys can't be set per-object (the engine applies filament
// presets per-extruder, not per-object) — the adapter's map_process_override
// already drops them, but we also hide them here so the panel only offers what
// actually takes effect per object.
const FILAMENT_SCOPED = new Set([
	'nozzleTemp', 'bedTemp', 'fanSpeed', 'retractionLength', 'retractionSpeed',
])

/**
 * Edit process-scoped overrides for the SELECTED object (v1.66). Binds each
 * OverrideField to the object's own `overrides` map (empty = inherit the global
 * setting). Reuses the settings-tree mode + the shared OverrideField chrome.
 * Backend was already wired (sliceStreamMulti → object_overrides → 3MF).
 */
export default {
	name: 'PerObjectSettingsPanel',
	components: { OverrideField },
	emits: ['change'],
	data() {
		return { query: '' }
	},
	computed: {
		...mapStores(usePrintStore),
		object() {
			const id = this.printStore.selectedObjectId
			return this.printStore.objects.find((o) => o.id === id) || null
		},
		overrides() {
			return this.object?.overrides || null
		},
		// Only meaningful for a real multi-object scene (per-object settings ride the
		// multi-object slice path; a single object uses the global overrides).
		isMultiObject() {
			return this.printStore.objects.length > 1
		},
		modifiedCount() {
			const ov = this.overrides || {}
			return Object.values(ov).filter((v) => v !== '' && v != null && v !== false).length
		},
		groups() {
			return groupsForMode(this.printStore.settingsMode, this.query)
				.map((g) => ({ group: g.group, fields: g.fields.filter((f) => !FILAMENT_SCOPED.has(f.key)) }))
				.filter((g) => g.fields.length)
		},
	},
	methods: {
		emitChange() {
			this.$emit('change')
		},
		clearAll() {
			if (this.overrides) {
				for (const k of Object.keys(this.overrides)) {
					this.$set(this.overrides, k, '')
				}
				this.emitChange()
			}
		},
	},
}
</script>

<template>
	<div v-if="isMultiObject && object" class="nc-print-perobj">
		<div class="nc-print-perobj__head">
			<span class="nc-print-perobj__title">
				Per-object: <strong>{{ object.name }}</strong>
			</span>
			<button
				v-if="modifiedCount"
				type="button"
				class="nc-print-perobj__clear"
				title="Clear all per-object overrides (inherit global)"
				@click="clearAll">
				Clear {{ modifiedCount }}
			</button>
		</div>
		<p class="nc-print-perobj__hint">
			Overrides for this object only. Empty = inherit the global setting.
			Temperature/fan/retraction are filament-wide and set globally.
		</p>
		<input
			v-model="query"
			type="search"
			class="nc-print-perobj__search"
			placeholder="Search settings…"
			aria-label="Search per-object settings">
		<template v-for="g in groups">
			<h4 :key="`h-${g.group}`" class="nc-print-perobj__group">{{ g.group }}</h4>
			<div :key="`g-${g.group}`" class="nc-print-overrides-grid">
				<OverrideField
					v-for="def in g.fields"
					:key="def.key"
					:def="def"
					:model="overrides"
					@change="emitChange" />
			</div>
		</template>
	</div>
</template>

<style scoped>
.nc-print-perobj {
	border-top: 1px solid var(--nc-gcs-border);
	margin-top: var(--nc-gcs-space-md);
	padding-top: var(--nc-gcs-space-md);
}

.nc-print-perobj__head {
	align-items: center;
	display: flex;
	gap: var(--nc-gcs-space-sm);
	justify-content: space-between;
}

.nc-print-perobj__title {
	font-size: var(--nc-gcs-text-sm);
	font-weight: 600;
}

.nc-print-perobj__clear {
	appearance: none;
	background: none;
	border: 1px solid var(--nc-app-accent, var(--color-primary-element));
	border-radius: 4px;
	color: var(--nc-app-accent, var(--color-primary-element));
	cursor: pointer;
	font: inherit;
	font-size: 10px;
	font-weight: 700;
	letter-spacing: 0.03em;
	padding: 2px 8px;
	text-transform: uppercase;
}

.nc-print-perobj__hint {
	color: var(--color-text-maxcontrast, #8b949e);
	font-size: 0.78rem;
	margin: 4px 0 var(--nc-gcs-space-sm);
}

.nc-print-perobj__search {
	margin-bottom: var(--nc-gcs-space-sm);
	max-width: 220px;
	width: 100%;
}

.nc-print-perobj__group {
	font-size: var(--nc-gcs-text-sm);
	font-weight: 600;
	margin: var(--nc-gcs-space-sm) 0 4px;
}

.nc-print-overrides-grid {
	display: grid;
	gap: var(--nc-gcs-space-sm);
	grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
}
</style>
