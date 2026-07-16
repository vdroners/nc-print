<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { groupsForMode, SETTINGS_LEVELS } from '@/services/slicer-utils.js'
import OverrideField from './OverrideField.vue'

const MODE_LABELS = { basic: 'Simple', advanced: 'Advanced', expert: 'Expert' }

// Prime-tower fields only apply to multi-material plates; hide that whole group
// for single-filament prints (mirrors the old v-if="isMultiMaterial" section).
const MULTI_MATERIAL_GROUPS = new Set(['Prime tower'])

/**
 * Data-driven settings tree (v1.65). Renders OVERRIDE_FIELD_DEFS grouped by
 * section, filtered by the Simple/Advanced/Expert mode + a search box, each field
 * an <OverrideField>. Replaces the ~15 hand-written sections; the is-modified +
 * ⟲ reset chrome now lives once in OverrideField.
 */
export default {
	name: 'ProfileQuickEdit',
	components: { OverrideField },
	emits: ['change'],
	data() {
		return {
			query: '',
		}
	},
	computed: {
		...mapStores(usePrintStore),
		modes() {
			return SETTINGS_LEVELS.map((m) => ({ value: m, label: MODE_LABELS[m] }))
		},
		mode() {
			return this.printStore.settingsMode
		},
		isMultiMaterial() {
			return (this.printStore.selection.filamentIds || []).length > 1
		},
		// Ordered [{ group, fields }] for the current mode + query, with the
		// multi-material-only groups filtered out for single-filament prints.
		groups() {
			return groupsForMode(this.mode, this.query)
				.filter((g) => this.isMultiMaterial || !MULTI_MATERIAL_GROUPS.has(g.group))
		},
	},
	methods: {
		emitChange() {
			this.$emit('change')
		},
		setMode(mode) {
			this.printStore.setSettingsMode(mode)
		},
	},
}
</script>

<template>
	<div class="nc-print-quick-edit">
		<div class="nc-print-quick-edit__toolbar">
			<div class="nc-print-quick-edit__modes" role="tablist" aria-label="Settings detail level">
				<button
					v-for="m in modes"
					:key="m.value"
					type="button"
					class="nc-print-quick-edit__mode"
					:class="{ 'is-active': mode === m.value }"
					role="tab"
					:aria-selected="mode === m.value"
					@click="setMode(m.value)">
					{{ m.label }}
				</button>
			</div>
			<input
				v-model="query"
				type="search"
				class="nc-print-quick-edit__search"
				placeholder="Search settings…"
				aria-label="Search settings">
		</div>

		<p v-if="!groups.length" class="nc-print-quick-edit__hint">
			No settings match “{{ query }}”.
		</p>

		<template v-for="g in groups">
			<h3 :key="`h-${g.group}`" class="nc-print-quick-edit__title">{{ g.group }}</h3>
			<div :key="`g-${g.group}`" class="nc-print-overrides-grid">
				<OverrideField
					v-for="def in g.fields"
					:key="def.key"
					:def="def"
					@change="emitChange" />
			</div>
		</template>
	</div>
</template>

<style scoped>
.nc-print-quick-edit__toolbar {
	align-items: center;
	display: flex;
	flex-wrap: wrap;
	gap: var(--nc-gcs-space-sm);
	justify-content: space-between;
	margin-bottom: var(--nc-gcs-space-sm);
}

.nc-print-quick-edit__modes {
	display: inline-flex;
	border: 1px solid var(--nc-gcs-border);
	border-radius: var(--nc-gcs-radius-sm, 6px);
	overflow: hidden;
}

.nc-print-quick-edit__mode {
	appearance: none;
	background: transparent;
	border: none;
	color: var(--nc-gcs-text-muted);
	cursor: pointer;
	font: inherit;
	font-size: var(--nc-gcs-text-sm);
	padding: 4px 12px;
}

.nc-print-quick-edit__mode.is-active {
	background: var(--nc-app-accent, var(--color-primary-element));
	color: var(--color-primary-element-text, #fff);
	font-weight: 600;
}

.nc-print-quick-edit__search {
	flex: 1 1 140px;
	max-width: 220px;
	min-width: 120px;
}

.nc-print-quick-edit__title {
	font-size: var(--nc-gcs-text-sm);
	font-weight: 600;
	margin: var(--nc-gcs-space-md) 0 var(--nc-gcs-space-sm);
}

.nc-print-quick-edit__title:first-of-type {
	margin-top: var(--nc-gcs-space-sm);
}

.nc-print-quick-edit__hint {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast, #8b949e);
	margin: 0 0 var(--nc-gcs-space-sm);
}

.nc-print-overrides-grid {
	display: grid;
	gap: var(--nc-gcs-space-sm);
	grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
}
</style>
