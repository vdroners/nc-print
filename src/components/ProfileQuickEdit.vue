<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { isOverrideModified } from '@/services/slicer-utils.js'

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

// Infill patterns exposed by the OrcaSlicer-fork engine (sparse_infill_pattern).
const INFILL_PATTERNS = [
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
]

// Top/bottom solid-surface patterns (top_surface_pattern / bottom_surface_pattern).
const SURFACE_PATTERNS = [
	{ value: '', label: 'Profile default' },
	{ value: 'monotonic', label: 'Monotonic' },
	{ value: 'monotonicline', label: 'Monotonic line' },
	{ value: 'concentric', label: 'Concentric' },
	{ value: 'rectilinear', label: 'Rectilinear' },
]

const SUPPORT_BASE_PATTERNS = [
	{ value: '', label: 'Profile default' },
	{ value: 'default', label: 'Default' },
	{ value: 'rectilinear', label: 'Rectilinear' },
	{ value: 'hollow', label: 'Hollow' },
]

const DRAFT_SHIELD = [
	{ value: '', label: 'Profile default' },
	{ value: 'disabled', label: 'Off' },
	{ value: 'enabled', label: 'On (all)' },
	{ value: 'limited', label: 'Limited (to brim height)' },
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
		infillPatterns() {
			return INFILL_PATTERNS
		},
		surfacePatterns() {
			return SURFACE_PATTERNS
		},
		supportBasePatterns() {
			return SUPPORT_BASE_PATTERNS
		},
		draftShieldOptions() {
			return DRAFT_SHIELD
		},
		// A prime/wipe tower only makes sense for a multi-material plate.
		isMultiMaterial() {
			return (this.printStore.selection.filamentIds || []).length > 1
		},
	},
	methods: {
		emitChange() {
			this.$emit('change')
		},
		isModified(key) {
			return isOverrideModified(key, this.printStore.overrides, this.printStore.overrideDefaults)
		},
		resetField(key) {
			this.printStore.resetOverrideField(key)
		},
	},
}
</script>

<template>
	<div class="nc-print-quick-edit">
		<h3 class="nc-print-quick-edit__title">Cooling &amp; retraction</h3>
		<div class="nc-print-overrides-grid">
			<div class="nc-print-field" :class="{ 'is-modified': isModified('fanSpeed') }">
				<label>Fan speed (%) <button v-if="isModified('fanSpeed')" type="button" class="nc-print-reset" title="Reset to profile" @click="resetField('fanSpeed')">⟲</button></label>
				<input v-model="printStore.overrides.fanSpeed" type="number" step="1" min="0" max="100" @change="emitChange">
			</div>
			<div class="nc-print-field" :class="{ 'is-modified': isModified('retractionLength') }">
				<label>Retraction (mm) <button v-if="isModified('retractionLength')" type="button" class="nc-print-reset" title="Reset to profile" @click="resetField('retractionLength')">⟲</button></label>
				<input v-model="printStore.overrides.retractionLength" type="number" step="0.1" min="0" @change="emitChange">
			</div>
			<div class="nc-print-field" :class="{ 'is-modified': isModified('retractionSpeed') }">
				<label>Retraction speed (mm/s) <button v-if="isModified('retractionSpeed')" type="button" class="nc-print-reset" title="Reset to profile" @click="resetField('retractionSpeed')">⟲</button></label>
				<input v-model="printStore.overrides.retractionSpeed" type="number" step="1" min="0" @change="emitChange">
			</div>
		</div>

		<h3 class="nc-print-quick-edit__title">Supports &amp; adhesion</h3>
		<div class="nc-print-overrides-grid">
			<div class="nc-print-field nc-print-field--checkbox" :class="{ 'is-modified': isModified('enableSupport') }">
				<label>
					<input v-model="printStore.overrides.enableSupport" type="checkbox" @change="emitChange">
					Enable supports
				</label>
			</div>
			<div class="nc-print-field" :class="{ 'is-modified': isModified('supportType') }">
				<label for="nc-print-support-type">Support type <button v-if="isModified('supportType')" type="button" class="nc-print-reset" title="Reset to profile" @click="resetField('supportType')">⟲</button></label>
				<select id="nc-print-support-type" v-model="printStore.overrides.supportType" @change="emitChange">
					<option v-for="opt in supportTypes" :key="opt.value || 'default'" :value="opt.value">
						{{ opt.label }}
					</option>
				</select>
			</div>
			<div class="nc-print-field" :class="{ 'is-modified': isModified('supportThreshold') }">
				<label>Support threshold (°) <button v-if="isModified('supportThreshold')" type="button" class="nc-print-reset" title="Reset to profile" @click="resetField('supportThreshold')">⟲</button></label>
				<input v-model="printStore.overrides.supportThreshold" type="number" step="1" min="0" max="90" @change="emitChange">
			</div>
			<div class="nc-print-field" :class="{ 'is-modified': isModified('brimWidth') }">
				<label>Brim width (mm) <button v-if="isModified('brimWidth')" type="button" class="nc-print-reset" title="Reset to profile" @click="resetField('brimWidth')">⟲</button></label>
				<input v-model="printStore.overrides.brimWidth" type="number" step="0.5" min="0" @change="emitChange">
			</div>
			<div class="nc-print-field" :class="{ 'is-modified': isModified('raftLayers') }">
				<label>Raft layers <button v-if="isModified('raftLayers')" type="button" class="nc-print-reset" title="Reset to profile" @click="resetField('raftLayers')">⟲</button></label>
				<input v-model="printStore.overrides.raftLayers" type="number" step="1" min="0" @change="emitChange">
			</div>
			<div class="nc-print-field" :class="{ 'is-modified': isModified('skirtLoops') }">
				<label>Skirt loops <button v-if="isModified('skirtLoops')" type="button" class="nc-print-reset" title="Reset to profile" @click="resetField('skirtLoops')">⟲</button></label>
				<input v-model="printStore.overrides.skirtLoops" type="number" step="1" min="0" @change="emitChange">
			</div>
			<div class="nc-print-field" :class="{ 'is-modified': isModified('supportTopGap') }">
				<label>Support top gap (mm) <button v-if="isModified('supportTopGap')" type="button" class="nc-print-reset" title="Reset to profile" @click="resetField('supportTopGap')">⟲</button></label>
				<input v-model="printStore.overrides.supportTopGap" type="number" step="0.05" min="0" @change="emitChange">
			</div>
			<div class="nc-print-field" :class="{ 'is-modified': isModified('supportInterfaceLayers') }">
				<label>Support interface layers <button v-if="isModified('supportInterfaceLayers')" type="button" class="nc-print-reset" title="Reset to profile" @click="resetField('supportInterfaceLayers')">⟲</button></label>
				<input v-model="printStore.overrides.supportInterfaceLayers" type="number" step="1" min="0" @change="emitChange">
			</div>
			<div class="nc-print-field" :class="{ 'is-modified': isModified('supportInterfaceSpacing') }">
				<label>Interface spacing (mm) <button v-if="isModified('supportInterfaceSpacing')" type="button" class="nc-print-reset" title="Reset to profile" @click="resetField('supportInterfaceSpacing')">⟲</button></label>
				<input v-model="printStore.overrides.supportInterfaceSpacing" type="number" step="0.05" min="0" @change="emitChange">
			</div>
		</div>

		<h3 class="nc-print-quick-edit__title">Surface quality</h3>
		<div class="nc-print-overrides-grid">
			<div class="nc-print-field" :class="{ 'is-modified': isModified('ironingType') }">
				<label for="nc-print-ironing-type">Ironing <button v-if="isModified('ironingType')" type="button" class="nc-print-reset" title="Reset to profile" @click="resetField('ironingType')">⟲</button></label>
				<select id="nc-print-ironing-type" v-model="printStore.overrides.ironingType" @change="emitChange">
					<option v-for="opt in ironingTypes" :key="opt.value || 'default'" :value="opt.value">{{ opt.label }}</option>
				</select>
			</div>
			<div class="nc-print-field" :class="{ 'is-modified': isModified('fuzzySkin') }">
				<label for="nc-print-fuzzy-skin">Fuzzy skin <button v-if="isModified('fuzzySkin')" type="button" class="nc-print-reset" title="Reset to profile" @click="resetField('fuzzySkin')">⟲</button></label>
				<select id="nc-print-fuzzy-skin" v-model="printStore.overrides.fuzzySkin" @change="emitChange">
					<option v-for="opt in fuzzySkinOptions" :key="opt.value || 'default'" :value="opt.value">{{ opt.label }}</option>
				</select>
			</div>
			<div class="nc-print-field" :class="{ 'is-modified': isModified('seamPosition') }">
				<label for="nc-print-seam-position">Seam position <button v-if="isModified('seamPosition')" type="button" class="nc-print-reset" title="Reset to profile" @click="resetField('seamPosition')">⟲</button></label>
				<select id="nc-print-seam-position" v-model="printStore.overrides.seamPosition" @change="emitChange">
					<option v-for="opt in seamPositions" :key="opt.value || 'default'" :value="opt.value">{{ opt.label }}</option>
				</select>
			</div>
			<div class="nc-print-field nc-print-field--checkbox" :class="{ 'is-modified': isModified('adaptiveLayerHeight') }">
				<label>
					<input v-model="printStore.overrides.adaptiveLayerHeight" type="checkbox" @change="emitChange">
					Adaptive layer height
				</label>
			</div>
			<div class="nc-print-field" :class="{ 'is-modified': isModified('firstLayerHeight') }">
				<label>First layer height (mm) <button v-if="isModified('firstLayerHeight')" type="button" class="nc-print-reset" title="Reset to profile" @click="resetField('firstLayerHeight')">⟲</button></label>
				<input v-model="printStore.overrides.firstLayerHeight" type="number" step="0.02" min="0" @change="emitChange">
			</div>
		</div>

		<h3 class="nc-print-quick-edit__title">Infill &amp; surface patterns</h3>
		<div class="nc-print-overrides-grid">
			<div class="nc-print-field" :class="{ 'is-modified': isModified('infillPattern') }">
				<label for="nc-print-infill-pattern">Infill pattern <button v-if="isModified('infillPattern')" type="button" class="nc-print-reset" title="Reset to profile" @click="resetField('infillPattern')">⟲</button></label>
				<select id="nc-print-infill-pattern" v-model="printStore.overrides.infillPattern" @change="emitChange">
					<option v-for="opt in infillPatterns" :key="opt.value || 'default'" :value="opt.value">{{ opt.label }}</option>
				</select>
			</div>
			<div class="nc-print-field" :class="{ 'is-modified': isModified('topSurfacePattern') }">
				<label for="nc-print-top-pattern">Top surface <button v-if="isModified('topSurfacePattern')" type="button" class="nc-print-reset" title="Reset to profile" @click="resetField('topSurfacePattern')">⟲</button></label>
				<select id="nc-print-top-pattern" v-model="printStore.overrides.topSurfacePattern" @change="emitChange">
					<option v-for="opt in surfacePatterns" :key="opt.value || 'default'" :value="opt.value">{{ opt.label }}</option>
				</select>
			</div>
			<div class="nc-print-field" :class="{ 'is-modified': isModified('bottomSurfacePattern') }">
				<label for="nc-print-bottom-pattern">Bottom surface <button v-if="isModified('bottomSurfacePattern')" type="button" class="nc-print-reset" title="Reset to profile" @click="resetField('bottomSurfacePattern')">⟲</button></label>
				<select id="nc-print-bottom-pattern" v-model="printStore.overrides.bottomSurfacePattern" @change="emitChange">
					<option v-for="opt in surfacePatterns" :key="opt.value || 'default'" :value="opt.value">{{ opt.label }}</option>
				</select>
			</div>
		</div>

		<h3 class="nc-print-quick-edit__title">Per-feature speeds</h3>
		<div class="nc-print-overrides-grid">
			<div class="nc-print-field" :class="{ 'is-modified': isModified('infillSpeed') }">
				<label>Infill speed (mm/s) <button v-if="isModified('infillSpeed')" type="button" class="nc-print-reset" title="Reset to profile" @click="resetField('infillSpeed')">⟲</button></label>
				<input v-model="printStore.overrides.infillSpeed" type="number" step="1" min="0" @change="emitChange">
			</div>
			<div class="nc-print-field" :class="{ 'is-modified': isModified('solidInfillSpeed') }">
				<label>Solid infill speed (mm/s) <button v-if="isModified('solidInfillSpeed')" type="button" class="nc-print-reset" title="Reset to profile" @click="resetField('solidInfillSpeed')">⟲</button></label>
				<input v-model="printStore.overrides.solidInfillSpeed" type="number" step="1" min="0" @change="emitChange">
			</div>
		</div>

		<template v-if="isMultiMaterial">
			<h3 class="nc-print-quick-edit__title">Prime / wipe tower</h3>
			<p class="nc-print-quick-edit__hint">
				Purge tower for multi-material prints — the tower catches the
				filament wasted at each colour change.
			</p>
			<div class="nc-print-overrides-grid">
				<div class="nc-print-field nc-print-field--checkbox" :class="{ 'is-modified': isModified('enablePrimeTower') }">
					<label>
						<input v-model="printStore.overrides.enablePrimeTower" type="checkbox" @change="emitChange">
						Enable prime tower
					</label>
				</div>
				<div class="nc-print-field" :class="{ 'is-modified': isModified('primeTowerWidth') }">
					<label>Tower width (mm) <button v-if="isModified('primeTowerWidth')" type="button" class="nc-print-reset" title="Reset to profile" @click="resetField('primeTowerWidth')">⟲</button></label>
					<input v-model="printStore.overrides.primeTowerWidth" type="number" step="1" min="0" @change="emitChange">
				</div>
				<div class="nc-print-field" :class="{ 'is-modified': isModified('primeTowerBrimWidth') }">
					<label>Tower brim (mm) <button v-if="isModified('primeTowerBrimWidth')" type="button" class="nc-print-reset" title="Reset to profile" @click="resetField('primeTowerBrimWidth')">⟲</button></label>
					<input v-model="printStore.overrides.primeTowerBrimWidth" type="number" step="0.5" min="0" @change="emitChange">
				</div>
				<div class="nc-print-field" :class="{ 'is-modified': isModified('primeVolume') }">
					<label>Prime volume (mm³) <button v-if="isModified('primeVolume')" type="button" class="nc-print-reset" title="Reset to profile" @click="resetField('primeVolume')">⟲</button></label>
					<input v-model="printStore.overrides.primeVolume" type="number" step="1" min="0" @change="emitChange">
				</div>
				<div class="nc-print-field" :class="{ 'is-modified': isModified('wipeTowerRotation') }">
					<label>Rotation (°) <button v-if="isModified('wipeTowerRotation')" type="button" class="nc-print-reset" title="Reset to profile" @click="resetField('wipeTowerRotation')">⟲</button></label>
					<input v-model="printStore.overrides.wipeTowerRotation" type="number" step="1" @change="emitChange">
				</div>
				<div class="nc-print-field" :class="{ 'is-modified': isModified('wipeTowerExtraSpacing') }">
					<label>Extra spacing (%) <button v-if="isModified('wipeTowerExtraSpacing')" type="button" class="nc-print-reset" title="Reset to profile" @click="resetField('wipeTowerExtraSpacing')">⟲</button></label>
					<input v-model="printStore.overrides.wipeTowerExtraSpacing" type="number" step="10" min="100" max="300" @change="emitChange">
				</div>
			</div>
		</template>

		<h3 class="nc-print-quick-edit__title">Quality</h3>
		<div class="nc-print-overrides-grid">
			<div class="nc-print-field" :class="{ 'is-modified': isModified('topShellLayers') }">
				<label>Top shell layers <button v-if="isModified('topShellLayers')" type="button" class="nc-print-reset" title="Reset to profile" @click="resetField('topShellLayers')">⟲</button></label>
				<input v-model="printStore.overrides.topShellLayers" type="number" step="1" min="0" @change="emitChange">
			</div>
			<div class="nc-print-field" :class="{ 'is-modified': isModified('bottomShellLayers') }">
				<label>Bottom shell layers <button v-if="isModified('bottomShellLayers')" type="button" class="nc-print-reset" title="Reset to profile" @click="resetField('bottomShellLayers')">⟲</button></label>
				<input v-model="printStore.overrides.bottomShellLayers" type="number" step="1" min="0" @change="emitChange">
			</div>
			<div class="nc-print-field" :class="{ 'is-modified': isModified('elephantFoot') }">
				<label>Elephant foot (mm) <button v-if="isModified('elephantFoot')" type="button" class="nc-print-reset" title="Reset to profile" @click="resetField('elephantFoot')">⟲</button></label>
				<input v-model="printStore.overrides.elephantFoot" type="number" step="0.05" min="0" @change="emitChange">
			</div>
			<div class="nc-print-field" :class="{ 'is-modified': isModified('infillWallOverlap') }">
				<label>Infill/wall overlap (%) <button v-if="isModified('infillWallOverlap')" type="button" class="nc-print-reset" title="Reset to profile" @click="resetField('infillWallOverlap')">⟲</button></label>
				<input v-model="printStore.overrides.infillWallOverlap" type="number" step="1" min="0" max="100" @change="emitChange">
			</div>
			<div class="nc-print-field" :class="{ 'is-modified': isModified('bridgeSpeed') }">
				<label>Bridge speed (mm/s) <button v-if="isModified('bridgeSpeed')" type="button" class="nc-print-reset" title="Reset to profile" @click="resetField('bridgeSpeed')">⟲</button></label>
				<input v-model="printStore.overrides.bridgeSpeed" type="number" step="1" min="0" @change="emitChange">
			</div>
			<div class="nc-print-field" :class="{ 'is-modified': isModified('bridgeFlow') }">
				<label>Bridge flow (ratio) <button v-if="isModified('bridgeFlow')" type="button" class="nc-print-reset" title="Reset to profile" @click="resetField('bridgeFlow')">⟲</button></label>
				<input v-model="printStore.overrides.bridgeFlow" type="number" step="0.05" min="0" max="2" @change="emitChange">
			</div>
			<div class="nc-print-field nc-print-field--checkbox" :class="{ 'is-modified': isModified('bridgeNoSupport') }">
				<label>
					<input v-model="printStore.overrides.bridgeNoSupport" type="checkbox" @change="emitChange">
					Bridges without support
				</label>
			</div>
		</div>

		<h3 class="nc-print-quick-edit__title">Overhang speed slowdown (mm/s)</h3>
		<p class="nc-print-quick-edit__hint">Slower speed as overhang steepness increases (0 = don't slow that band).</p>
		<div class="nc-print-overrides-grid">
			<div class="nc-print-field" :class="{ 'is-modified': isModified('overhangSpeed1') }">
				<label>0–25% <button v-if="isModified('overhangSpeed1')" type="button" class="nc-print-reset" title="Reset to profile" @click="resetField('overhangSpeed1')">⟲</button></label>
				<input v-model="printStore.overrides.overhangSpeed1" type="number" step="1" min="0" @change="emitChange">
			</div>
			<div class="nc-print-field" :class="{ 'is-modified': isModified('overhangSpeed2') }">
				<label>25–50% <button v-if="isModified('overhangSpeed2')" type="button" class="nc-print-reset" title="Reset to profile" @click="resetField('overhangSpeed2')">⟲</button></label>
				<input v-model="printStore.overrides.overhangSpeed2" type="number" step="1" min="0" @change="emitChange">
			</div>
			<div class="nc-print-field" :class="{ 'is-modified': isModified('overhangSpeed3') }">
				<label>50–75% <button v-if="isModified('overhangSpeed3')" type="button" class="nc-print-reset" title="Reset to profile" @click="resetField('overhangSpeed3')">⟲</button></label>
				<input v-model="printStore.overrides.overhangSpeed3" type="number" step="1" min="0" @change="emitChange">
			</div>
			<div class="nc-print-field" :class="{ 'is-modified': isModified('overhangSpeed4') }">
				<label>75–100% <button v-if="isModified('overhangSpeed4')" type="button" class="nc-print-reset" title="Reset to profile" @click="resetField('overhangSpeed4')">⟲</button></label>
				<input v-model="printStore.overrides.overhangSpeed4" type="number" step="1" min="0" @change="emitChange">
			</div>
		</div>

		<h3 class="nc-print-quick-edit__title">Ironing &amp; support detail</h3>
		<div class="nc-print-overrides-grid">
			<div class="nc-print-field" :class="{ 'is-modified': isModified('ironingFlow') }">
				<label>Ironing flow (%) <button v-if="isModified('ironingFlow')" type="button" class="nc-print-reset" title="Reset to profile" @click="resetField('ironingFlow')">⟲</button></label>
				<input v-model="printStore.overrides.ironingFlow" type="number" step="1" min="0" max="100" @change="emitChange">
			</div>
			<div class="nc-print-field" :class="{ 'is-modified': isModified('ironingSpacing') }">
				<label>Ironing spacing (mm) <button v-if="isModified('ironingSpacing')" type="button" class="nc-print-reset" title="Reset to profile" @click="resetField('ironingSpacing')">⟲</button></label>
				<input v-model="printStore.overrides.ironingSpacing" type="number" step="0.01" min="0" @change="emitChange">
			</div>
			<div class="nc-print-field" :class="{ 'is-modified': isModified('ironingSpeed') }">
				<label>Ironing speed (mm/s) <button v-if="isModified('ironingSpeed')" type="button" class="nc-print-reset" title="Reset to profile" @click="resetField('ironingSpeed')">⟲</button></label>
				<input v-model="printStore.overrides.ironingSpeed" type="number" step="1" min="0" @change="emitChange">
			</div>
			<div class="nc-print-field" :class="{ 'is-modified': isModified('supportInterfaceBottomLayers') }">
				<label>Support interface bottom layers <button v-if="isModified('supportInterfaceBottomLayers')" type="button" class="nc-print-reset" title="Reset to profile" @click="resetField('supportInterfaceBottomLayers')">⟲</button></label>
				<input v-model="printStore.overrides.supportInterfaceBottomLayers" type="number" step="1" min="0" @change="emitChange">
			</div>
			<div class="nc-print-field" :class="{ 'is-modified': isModified('supportBasePattern') }">
				<label for="nc-print-support-base">Support base pattern <button v-if="isModified('supportBasePattern')" type="button" class="nc-print-reset" title="Reset to profile" @click="resetField('supportBasePattern')">⟲</button></label>
				<select id="nc-print-support-base" v-model="printStore.overrides.supportBasePattern" @change="emitChange">
					<option v-for="opt in supportBasePatterns" :key="opt.value || 'default'" :value="opt.value">{{ opt.label }}</option>
				</select>
			</div>
			<div class="nc-print-field" :class="{ 'is-modified': isModified('treeSupportBranchAngle') }">
				<label>Tree support branch angle (°) <button v-if="isModified('treeSupportBranchAngle')" type="button" class="nc-print-reset" title="Reset to profile" @click="resetField('treeSupportBranchAngle')">⟲</button></label>
				<input v-model="printStore.overrides.treeSupportBranchAngle" type="number" step="1" min="0" max="60" @change="emitChange">
			</div>
			<div class="nc-print-field" :class="{ 'is-modified': isModified('draftShield') }">
				<label for="nc-print-draft-shield">Draft shield <button v-if="isModified('draftShield')" type="button" class="nc-print-reset" title="Reset to profile" @click="resetField('draftShield')">⟲</button></label>
				<select id="nc-print-draft-shield" v-model="printStore.overrides.draftShield" @change="emitChange">
					<option v-for="opt in draftShieldOptions" :key="opt.value || 'default'" :value="opt.value">{{ opt.label }}</option>
				</select>
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

/* Modified-value highlight + per-field reset (mirrors PrepareOverrides). */
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

.nc-print-quick-edit__title:first-child {
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

.nc-print-field--checkbox label {
	align-items: center;
	display: flex;
	flex-direction: row;
	gap: 8px;
	min-height: 36px;
}
</style>
