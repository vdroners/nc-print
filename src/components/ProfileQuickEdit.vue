<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'

const SUPPORT_TYPES = [
	{ value: '', label: 'Profile default' },
	{ value: 'normal', label: 'Normal' },
	{ value: 'tree', label: 'Tree' },
	{ value: 'snug', label: 'Snug' },
	{ value: 'grid', label: 'Grid' },
]

const IRONING_TYPES = [
	{ value: '', label: 'Profile default' },
	{ value: 'no ironing', label: 'Off' },
	{ value: 'top', label: 'Top surfaces' },
	{ value: 'topmost', label: 'Topmost only' },
	{ value: 'solid', label: 'All solid' },
]

const FUZZY_SKIN = [
	{ value: '', label: 'Profile default' },
	{ value: 'none', label: 'Off' },
	{ value: 'external', label: 'Outer walls' },
	{ value: 'all', label: 'All walls' },
]

const SEAM_POSITIONS = [
	{ value: '', label: 'Profile default' },
	{ value: 'aligned', label: 'Aligned' },
	{ value: 'nearest', label: 'Nearest' },
	{ value: 'back', label: 'Back' },
	{ value: 'random', label: 'Random' },
]

export default {
	name: 'ProfileQuickEdit',
	emits: ['change'],
	computed: {
		...mapStores(usePrintStore),
		supportTypes() {
			return SUPPORT_TYPES
		},
		ironingTypes() {
			return IRONING_TYPES
		},
		fuzzySkinOptions() {
			return FUZZY_SKIN
		},
		seamPositions() {
			return SEAM_POSITIONS
		},
	},
	methods: {
		emitChange() {
			this.$emit('change')
		},
	},
}
</script>

<template>
	<div class="nc-print-quick-edit">
		<h3 class="nc-print-quick-edit__title">Cooling &amp; retraction</h3>
		<div class="nc-print-overrides-grid">
			<div class="nc-print-field">
				<label>Fan speed (%)</label>
				<input v-model="printStore.overrides.fanSpeed" type="number" step="1" min="0" max="100" @change="emitChange">
			</div>
			<div class="nc-print-field">
				<label>Retraction (mm)</label>
				<input v-model="printStore.overrides.retractionLength" type="number" step="0.1" min="0" @change="emitChange">
			</div>
			<div class="nc-print-field">
				<label>Retraction speed (mm/s)</label>
				<input v-model="printStore.overrides.retractionSpeed" type="number" step="1" min="0" @change="emitChange">
			</div>
		</div>

		<h3 class="nc-print-quick-edit__title">Supports &amp; adhesion</h3>
		<div class="nc-print-overrides-grid">
			<div class="nc-print-field nc-print-field--checkbox">
				<label>
					<input v-model="printStore.overrides.enableSupport" type="checkbox" @change="emitChange">
					Enable supports
				</label>
			</div>
			<div class="nc-print-field">
				<label for="nc-print-support-type">Support type</label>
				<select id="nc-print-support-type" v-model="printStore.overrides.supportType" @change="emitChange">
					<option v-for="opt in supportTypes" :key="opt.value || 'default'" :value="opt.value">
						{{ opt.label }}
					</option>
				</select>
			</div>
			<div class="nc-print-field">
				<label>Support threshold (°)</label>
				<input v-model="printStore.overrides.supportThreshold" type="number" step="1" min="0" max="90" @change="emitChange">
			</div>
			<div class="nc-print-field">
				<label>Brim width (mm)</label>
				<input v-model="printStore.overrides.brimWidth" type="number" step="0.5" min="0" @change="emitChange">
			</div>
			<div class="nc-print-field">
				<label>Raft layers</label>
				<input v-model="printStore.overrides.raftLayers" type="number" step="1" min="0" @change="emitChange">
			</div>
			<div class="nc-print-field">
				<label>Skirt loops</label>
				<input v-model="printStore.overrides.skirtLoops" type="number" step="1" min="0" @change="emitChange">
			</div>
		</div>

		<h3 class="nc-print-quick-edit__title">Surface quality</h3>
		<div class="nc-print-overrides-grid">
			<div class="nc-print-field">
				<label for="nc-print-ironing-type">Ironing</label>
				<select id="nc-print-ironing-type" v-model="printStore.overrides.ironingType" @change="emitChange">
					<option v-for="opt in ironingTypes" :key="opt.value || 'default'" :value="opt.value">{{ opt.label }}</option>
				</select>
			</div>
			<div class="nc-print-field">
				<label for="nc-print-fuzzy-skin">Fuzzy skin</label>
				<select id="nc-print-fuzzy-skin" v-model="printStore.overrides.fuzzySkin" @change="emitChange">
					<option v-for="opt in fuzzySkinOptions" :key="opt.value || 'default'" :value="opt.value">{{ opt.label }}</option>
				</select>
			</div>
			<div class="nc-print-field">
				<label for="nc-print-seam-position">Seam position</label>
				<select id="nc-print-seam-position" v-model="printStore.overrides.seamPosition" @change="emitChange">
					<option v-for="opt in seamPositions" :key="opt.value || 'default'" :value="opt.value">{{ opt.label }}</option>
				</select>
			</div>
			<div class="nc-print-field nc-print-field--checkbox">
				<label>
					<input v-model="printStore.overrides.adaptiveLayerHeight" type="checkbox" @change="emitChange">
					Adaptive layer height
				</label>
			</div>
		</div>
	</div>
</template>

<style scoped>
.nc-print-quick-edit__title {
	font-size: var(--nc-gcs-text-sm);
	font-weight: 600;
	margin: var(--nc-gcs-space-md) 0 var(--nc-gcs-space-sm);
}

.nc-print-quick-edit__title:first-child {
	margin-top: var(--nc-gcs-space-sm);
}

.nc-print-overrides-grid {
	display: grid;
	gap: var(--nc-gcs-space-sm);
	grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
}

.nc-print-field--checkbox label {
	align-items: center;
	display: flex;
	flex-direction: row;
	gap: 8px;
	min-height: 36px;
}
</style>
