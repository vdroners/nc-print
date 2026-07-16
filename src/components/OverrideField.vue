<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { isOverrideModified } from '@/services/slicer-utils.js'

// Select option lists keyed by override field key. Fields not listed here render
// as number (type:'num'/'pct') or checkbox (type:'bool') inputs. Moved here from
// ProfileQuickEdit's hand-written sections so the settings tree is data-driven.
const SELECT_OPTIONS = {
	supportType: [
		{ value: '', label: 'Profile default' },
		{ value: 'normal', label: 'Normal' },
		{ value: 'tree', label: 'Tree' },
		{ value: 'snug', label: 'Snug' },
		{ value: 'grid', label: 'Grid' },
	],
	ironingType: [
		{ value: '', label: 'Profile default' },
		{ value: 'no ironing', label: 'Off' },
		{ value: 'top', label: 'Top surfaces' },
		{ value: 'topmost', label: 'Topmost only' },
		{ value: 'solid', label: 'All solid' },
	],
	fuzzySkin: [
		{ value: '', label: 'Profile default' },
		{ value: 'none', label: 'Off' },
		{ value: 'external', label: 'Outer walls' },
		{ value: 'all', label: 'All walls' },
	],
	seamPosition: [
		{ value: '', label: 'Profile default' },
		{ value: 'aligned', label: 'Aligned' },
		{ value: 'nearest', label: 'Nearest' },
		{ value: 'back', label: 'Back' },
		{ value: 'random', label: 'Random' },
	],
	infillPattern: [
		{ value: '', label: 'Profile default' },
		{ value: 'grid', label: 'Grid' },
		{ value: 'gyroid', label: 'Gyroid' },
		{ value: 'honeycomb', label: 'Honeycomb' },
		{ value: 'cubic', label: 'Cubic' },
		{ value: 'adaptivecubic', label: 'Adaptive cubic' },
		{ value: 'triangles', label: 'Triangles' },
		{ value: 'rectilinear', label: 'Rectilinear' },
		{ value: 'concentric', label: 'Concentric' },
		{ value: 'line', label: 'Line' },
	],
	topSurfacePattern: [
		{ value: '', label: 'Profile default' },
		{ value: 'monotonic', label: 'Monotonic' },
		{ value: 'monotonicline', label: 'Monotonic line' },
		{ value: 'concentric', label: 'Concentric' },
		{ value: 'rectilinear', label: 'Rectilinear' },
	],
	bottomSurfacePattern: [
		{ value: '', label: 'Profile default' },
		{ value: 'monotonic', label: 'Monotonic' },
		{ value: 'monotonicline', label: 'Monotonic line' },
		{ value: 'concentric', label: 'Concentric' },
		{ value: 'rectilinear', label: 'Rectilinear' },
	],
	supportBasePattern: [
		{ value: '', label: 'Profile default' },
		{ value: 'default', label: 'Default' },
		{ value: 'rectilinear', label: 'Rectilinear' },
		{ value: 'hollow', label: 'Hollow' },
	],
	draftShield: [
		{ value: '', label: 'Profile default' },
		{ value: 'disabled', label: 'Off' },
		{ value: 'enabled', label: 'On (all)' },
		{ value: 'limited', label: 'Limited (to brim height)' },
	],
	bedType: [
		{ value: '', label: 'Profile default' },
		{ value: 'Cool Plate', label: 'Cool plate' },
		{ value: 'Engineering Plate', label: 'Engineering plate' },
		{ value: 'High Temp Plate', label: 'High-temp plate' },
		{ value: 'Textured PEI Plate', label: 'Textured PEI' },
	],
}

// Per-field number-input hints (step/min/max). Sensible defaults otherwise.
const NUM_ATTRS = {
	layerHeight: { step: 0.02, min: 0 },
	firstLayerHeight: { step: 0.02, min: 0 },
	lineWidth: { step: 0.01, min: 0 },
	infillDensity: { step: 1, min: 0, max: 100 },
	infillWallOverlap: { step: 1, min: 0, max: 100 },
	fanSpeed: { step: 1, min: 0, max: 100 },
	retractionLength: { step: 0.1, min: 0 },
	supportThreshold: { step: 1, min: 0, max: 90 },
	brimWidth: { step: 0.5, min: 0 },
	supportTopGap: { step: 0.05, min: 0 },
	supportInterfaceSpacing: { step: 0.05, min: 0 },
	elephantFoot: { step: 0.05, min: 0 },
	bridgeFlow: { step: 0.05, min: 0, max: 2 },
	ironingFlow: { step: 1, min: 0, max: 100 },
	ironingSpacing: { step: 0.01, min: 0 },
	treeSupportBranchAngle: { step: 1, min: 0, max: 60 },
	wipeTowerExtraSpacing: { step: 10, min: 100, max: 300 },
	primeTowerBrimWidth: { step: 0.5, min: 0 },
}

/**
 * A single override control (number / percent / checkbox / select), driven by an
 * OVERRIDE_FIELD_DEFS entry. Encapsulates the is-modified highlight + ⟲ reset
 * chrome that was copy-pasted ~55× in ProfileQuickEdit. Two-way binds directly to
 * printStore.overrides[def.key] and emits `change` on edit (parent re-slices).
 */
export default {
	name: 'OverrideField',
	props: {
		def: { type: Object, required: true },
		// Optional override map to bind to (per-object settings). When omitted the
		// field edits the global printStore.overrides. When set, "modified" means
		// "differs from the global override" (i.e. this object diverges), and reset
		// clears the per-object key (back to inheriting the global value).
		model: { type: Object, default: null },
	},
	emits: ['change'],
	computed: {
		...mapStores(usePrintStore),
		isPerObject() {
			return !!this.model
		},
		// The reactive object this field reads/writes: the per-object map or global.
		bound() {
			return this.model || this.printStore.overrides
		},
		value: {
			get() {
				return this.bound[this.def.key]
			},
			set(v) {
				// Vue 2 reactivity for keys that may not exist yet on a per-object map.
				this.$set(this.bound, this.def.key, v)
			},
		},
		isCheckbox() {
			return this.def.type === 'bool'
		},
		isSelect() {
			return this.def.type === 'str' && !!SELECT_OPTIONS[this.def.key]
		},
		selectOptions() {
			return SELECT_OPTIONS[this.def.key] || []
		},
		numAttrs() {
			return NUM_ATTRS[this.def.key] || { step: 1, min: 0 }
		},
		resetTitle() {
			return this.isPerObject ? 'Clear (inherit global)' : 'Reset to profile'
		},
		modified() {
			if (this.isPerObject) {
				// Per-object: modified = a non-empty value that differs from global.
				const v = this.bound[this.def.key]
				if (v === '' || v == null || v === false) {
					return false
				}
				return String(v) !== String(this.printStore.overrides[this.def.key] ?? '')
			}
			return isOverrideModified(this.def.key, this.printStore.overrides, this.printStore.overrideDefaults)
		},
	},
	methods: {
		onChange() {
			this.$emit('change')
		},
		reset() {
			if (this.isPerObject) {
				this.$set(this.bound, this.def.key, '') // inherit global again
			} else {
				this.printStore.resetOverrideField(this.def.key)
			}
			this.$emit('change')
		},
	},
}
</script>

<template>
	<div
		class="nc-print-field"
		:class="{ 'is-modified': modified, 'nc-print-field--checkbox': isCheckbox }">
		<template v-if="isCheckbox">
			<label>
				<input v-model="value" type="checkbox" @change="onChange">
				{{ def.label }}
				<button v-if="modified" type="button" class="nc-print-reset" :title="resetTitle" @click.prevent="reset">⟲</button>
			</label>
		</template>
		<template v-else>
			<label>
				{{ def.label }}
				<button v-if="modified" type="button" class="nc-print-reset" :title="resetTitle" @click.prevent="reset">⟲</button>
			</label>
			<select v-if="isSelect" v-model="value" @change="onChange">
				<option v-for="opt in selectOptions" :key="opt.value || 'default'" :value="opt.value">{{ opt.label }}</option>
			</select>
			<input
				v-else
				v-model="value"
				type="number"
				:step="numAttrs.step"
				:min="numAttrs.min"
				:max="numAttrs.max"
				@change="onChange">
		</template>
	</div>
</template>

<style scoped>
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
.nc-print-field--checkbox label {
	align-items: center;
	display: flex;
	flex-direction: row;
	gap: 8px;
	min-height: 36px;
}
</style>
