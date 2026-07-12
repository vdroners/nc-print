<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'

const TITLES = {
	move: 'Move',
	rotate: 'Rotate',
	scale: 'Scale',
	autoorient: 'Auto-orient',
	face: 'Place on face',
	mirror: 'Mirror',
	cut: 'Plane cut',
	drill: 'Drill hole',
	hollow: 'Hollow',
	emboss: 'Emboss text',
	view: 'View & section',
	measure: 'Measure',
	arrange: 'Arrange all',
}

export default {
	name: 'PrepareToolPanel',
	props: {
		tool: { type: String, default: '' },
		bounds: { type: Object, default: null },
		disabled: { type: Boolean, default: false },
		facePickActive: { type: Boolean, default: false },
		// Point-to-point measurement result (mm), or null. Owned by PrepareTab.
		measureDistance: { type: Number, default: null },
	},
	data() {
		return {
			move: { x: 0, y: 0, z: 0 },
			rotate: { x: 0, y: 0, z: 0 },
			scaleUniform: 100,
			scaleAxis: { x: 100, y: 100, z: 100 },
			toSize: { axis: 'x', value: 0 },
			unit: 'mm', // 'mm' | 'in' for the "to size" field
			lockAspect: true,
			cut: { axis: 'z', pos: 50, keep: 'both', cap: true },
			wireframe: false,
			section: { enabled: false, axis: 'z', offset: 0, flip: false },
			modelColor: '#22c55e',
			modelOpacity: 0.85,
			drill: { diameter: 4, depth: 5, through: true },
			hollow: { thickness: 2, drainDiameter: 0 },
			emboss: { text: '', size: 6, depth: 1, mode: 'emboss' },
			drillArmed: false,
			embossArmed: false,
			measureArmed: false,
		}
	},
	computed: {
		...mapStores(usePrintStore),
		title() {
			return TITLES[this.tool] || ''
		},
		bbox() {
			return this.printStore.modelMeta.bbox
		},
		offBed() {
			return !!this.bounds && (
				this.bounds.min[0] < -0.5 || this.bounds.min[1] < -0.5 || this.bounds.min[2] < -0.5
			)
		},
		axisRange() {
			const idx = this.section.axis === 'x' ? 0 : this.section.axis === 'y' ? 1 : 2
			if (!this.bounds) {
				return { min: 0, max: 100 }
			}
			return { min: this.bounds.min[idx], max: this.bounds.max[idx] }
		},
	},
	watch: {
		tool() {
			this.syncFromBounds()
		},
		bounds() {
			this.syncFromBounds()
		},
	},
	mounted() {
		this.syncFromBounds()
		// Seed colour/opacity from the persisted view prefs.
		const vp = this.printStore.viewPrefs || {}
		if (typeof vp.modelColor === 'string') {
			this.modelColor = vp.modelColor
		}
		if (typeof vp.modelOpacity === 'number') {
			this.modelOpacity = vp.modelOpacity
		}
	},
	methods: {
		syncFromBounds() {
			if (this.bounds) {
				this.move = {
					x: Math.round(this.bounds.center[0] * 10) / 10,
					y: Math.round(this.bounds.center[1] * 10) / 10,
					z: Math.round(this.bounds.min[2] * 10) / 10,
				}
				const idx = this.section.axis === 'x' ? 0 : this.section.axis === 'y' ? 1 : 2
				this.section.offset = Math.round(((this.bounds.min[idx] + this.bounds.max[idx]) / 2) * 10) / 10
				if (!this.toSize.value) {
					const ti = this.toSize.axis === 'x' ? 0 : this.toSize.axis === 'y' ? 1 : 2
					this.toSize.value = Math.round(this.bounds.size[ti] * 10) / 10
				}
			}
		},
		emitMove() {
			// Convert desired center (x,y) + min-z into a world delta.
			if (!this.bounds) {
				return
			}
			const dx = Number(this.move.x) - this.bounds.center[0]
			const dy = Number(this.move.y) - this.bounds.center[1]
			const dz = Number(this.move.z) - this.bounds.min[2]
			this.$emit('move-delta', { dx, dy, dz })
		},
		emitRotate() {
			this.$emit('rotate-degrees', {
				x: Number(this.rotate.x) || 0,
				y: Number(this.rotate.y) || 0,
				z: Number(this.rotate.z) || 0,
			})
			this.rotate = { x: 0, y: 0, z: 0 }
		},
		emitScaleUniform() {
			const pct = Number(this.scaleUniform)
			if (pct > 0) {
				this.$emit('scale-uniform', pct / 100)
				this.scaleUniform = 100
			}
		},
		emitScaleAxis() {
			const vec = [
				(Number(this.scaleAxis.x) || 100) / 100,
				(Number(this.scaleAxis.y) || 100) / 100,
				(Number(this.scaleAxis.z) || 100) / 100,
			]
			this.$emit('scale-axis', vec)
			this.scaleAxis = { x: 100, y: 100, z: 100 }
		},
		emitToSize() {
			const raw = Number(this.toSize.value)
			if (raw > 0) {
				// Engine works in mm; convert if the field is showing inches.
				const value = this.unit === 'in' ? raw * 25.4 : raw
				this.$emit('scale-to-size', { axis: this.toSize.axis, value, lockAspect: this.lockAspect })
			}
		},
		toggleUnit() {
			if (this.unit === 'mm') {
				this.unit = 'in'
				this.toSize.value = Math.round((Number(this.toSize.value) / 25.4) * 100) / 100
			} else {
				this.unit = 'mm'
				this.toSize.value = Math.round(Number(this.toSize.value) * 25.4 * 10) / 10
			}
		},
		emitCutPreview() {
			this.$emit('cut-preview', { axis: this.cut.axis, position01: this.cut.pos / 100 })
		},
		emitCutApply() {
			this.$emit('cut-apply', {
				axis: this.cut.axis,
				position01: this.cut.pos / 100,
				keep: this.cut.keep,
				cap: this.cut.cap,
			})
		},
		emitWireframe() {
			this.$emit('wireframe', this.wireframe)
		},
		emitModelColor() {
			this.$emit('model-color', this.modelColor)
		},
		emitModelOpacity() {
			this.$emit('model-opacity', Number(this.modelOpacity))
		},
		toggleDrill() {
			this.drillArmed = !this.drillArmed
			this.$emit('drill-arm', this.drillArmed ? { ...this.drill } : null)
		},
		emitHollow() {
			this.$emit('hollow', { ...this.hollow })
		},
		toggleEmboss() {
			this.embossArmed = !this.embossArmed
			this.$emit('emboss-arm', this.embossArmed ? { ...this.emboss } : null)
		},
		toggleMeasure() {
			this.measureArmed = !this.measureArmed
			this.$emit('measure-arm', this.measureArmed)
		},
		emitSection() {
			this.$emit('section', { ...this.section, offset: Number(this.section.offset) })
		},
		onSectionAxis() {
			this.syncFromBounds()
			this.emitSection()
		},
	},
}
</script>

<template>
	<div v-if="tool" class="nc-print-tool-panel" :class="{ 'nc-print-tool-panel--disabled': disabled }">
		<header class="nc-print-tool-panel__header">
			<h3 class="nc-print-tool-panel__title">{{ title }}</h3>
			<button type="button" class="nc-print-tool-panel__close" title="Close" @click="$emit('close')">✕</button>
		</header>

		<!-- Move -->
		<div v-if="tool === 'move'" class="nc-print-tool-panel__body">
			<p v-if="offBed" class="nc-print-tool-panel__warn">Model is off the bed.</p>
			<div class="nc-print-tool-panel__grid">
				<label>X <input v-model.number="move.x" type="number" step="1" :disabled="disabled"></label>
				<label>Y <input v-model.number="move.y" type="number" step="1" :disabled="disabled"></label>
				<label>Z <input v-model.number="move.z" type="number" step="1" :disabled="disabled"></label>
			</div>
			<div class="nc-print-tool-panel__actions">
				<button type="button" class="nc-print-btn" :disabled="disabled" @click="emitMove">Set position</button>
				<button type="button" class="nc-print-btn" :disabled="disabled" @click="$emit('drop-to-bed')">Drop to bed</button>
				<button type="button" class="nc-print-btn" :disabled="disabled" title="Center on X/Y, keep current height" @click="$emit('center-xy')">Center XY</button>
				<button type="button" class="nc-print-btn" :disabled="disabled" title="Center on bed and drop to z=0" @click="$emit('center')">Center + drop</button>
			</div>
			<p class="nc-print-tool-panel__hint">Drag the on-screen arrows to move; snaps to 1 mm.</p>
		</div>

		<!-- Rotate -->
		<div v-else-if="tool === 'rotate'" class="nc-print-tool-panel__body">
			<div class="nc-print-tool-panel__grid">
				<label>X° <input v-model.number="rotate.x" type="number" step="1" :disabled="disabled"></label>
				<label>Y° <input v-model.number="rotate.y" type="number" step="1" :disabled="disabled"></label>
				<label>Z° <input v-model.number="rotate.z" type="number" step="1" :disabled="disabled"></label>
			</div>
			<div class="nc-print-tool-panel__actions">
				<button type="button" class="nc-print-btn" :disabled="disabled" @click="emitRotate">Apply rotation</button>
			</div>
			<div class="nc-print-tool-panel__actions">
				<button type="button" class="nc-print-btn nc-print-btn--sm" :disabled="disabled" @click="$emit('rotate-degrees', { x: 90 })">+90 X</button>
				<button type="button" class="nc-print-btn nc-print-btn--sm" :disabled="disabled" @click="$emit('rotate-degrees', { y: 90 })">+90 Y</button>
				<button type="button" class="nc-print-btn nc-print-btn--sm" :disabled="disabled" @click="$emit('rotate-degrees', { z: 90 })">+90 Z</button>
			</div>
			<div class="nc-print-tool-panel__actions">
				<button type="button" class="nc-print-btn nc-print-btn--sm" :disabled="disabled" title="Rotate 45° around X" @click="$emit('rotate-degrees', { x: 45 })">+45 X</button>
				<button type="button" class="nc-print-btn nc-print-btn--sm" :disabled="disabled" title="Rotate 45° around Y" @click="$emit('rotate-degrees', { y: 45 })">+45 Y</button>
				<button type="button" class="nc-print-btn nc-print-btn--sm" :disabled="disabled" title="Rotate 45° around Z" @click="$emit('rotate-degrees', { z: 45 })">+45 Z</button>
			</div>
			<div class="nc-print-tool-panel__actions">
				<button type="button" class="nc-print-btn nc-print-btn--sm" :disabled="disabled" title="Flip 180° around X" @click="$emit('rotate-degrees', { x: 180 })">Flip X</button>
				<button type="button" class="nc-print-btn nc-print-btn--sm" :disabled="disabled" title="Flip 180° around Y" @click="$emit('rotate-degrees', { y: 180 })">Flip Y</button>
				<button type="button" class="nc-print-btn nc-print-btn--sm" :disabled="disabled" title="Snap each axis to the nearest 90°" @click="$emit('snap-axis')">Snap 90°</button>
			</div>
			<div class="nc-print-tool-panel__actions">
				<button type="button" class="nc-print-btn" :disabled="disabled" @click="$emit('lay-flat')">Lay flat</button>
				<button type="button" class="nc-print-btn" :disabled="disabled" @click="$emit('auto-orient')">Auto-orient</button>
				<button type="button" class="nc-print-btn" :disabled="disabled" @click="$emit('reset-rotation')">Reset</button>
			</div>
			<p class="nc-print-tool-panel__hint">Drag the on-screen rings to rotate; snaps to 15°.</p>
		</div>

		<!-- Auto-orient -->
		<div v-else-if="tool === 'autoorient'" class="nc-print-tool-panel__body">
			<p class="nc-print-tool-panel__hint">
				Rotate the model to an axis-aligned orientation that best fits the
				chosen goal, then drop it to the bed.
			</p>
			<div class="nc-print-tool-panel__stack">
				<button
					type="button"
					class="nc-print-btn nc-print-btn--primary"
					:disabled="disabled"
					title="Balanced — lowest overhang without standing the part too tall"
					@click="$emit('auto-orient', 'default')">
					Default (balanced)
				</button>
				<button
					type="button"
					class="nc-print-btn"
					:disabled="disabled"
					title="Rotate to the orientation with the least overhang (fewest supports)"
					@click="$emit('auto-orient', 'supports')">
					Minimize supports
				</button>
				<button
					type="button"
					class="nc-print-btn"
					:disabled="disabled"
					title="Lay the part flattest — smallest height, most bed contact"
					@click="$emit('auto-orient', 'footprint')">
					Minimize footprint
				</button>
			</div>
		</div>

		<!-- Scale -->
		<div v-else-if="tool === 'scale'" class="nc-print-tool-panel__body">
			<div class="nc-print-tool-panel__row">
				<label>Uniform % <input v-model.number="scaleUniform" type="number" min="1" step="1" :disabled="disabled"></label>
				<button type="button" class="nc-print-btn" :disabled="disabled" @click="emitScaleUniform">Apply</button>
			</div>
			<div class="nc-print-tool-panel__grid">
				<label>X % <input v-model.number="scaleAxis.x" type="number" min="1" step="1" :disabled="disabled"></label>
				<label>Y % <input v-model.number="scaleAxis.y" type="number" min="1" step="1" :disabled="disabled"></label>
				<label>Z % <input v-model.number="scaleAxis.z" type="number" min="1" step="1" :disabled="disabled"></label>
			</div>
			<div class="nc-print-tool-panel__actions">
				<button type="button" class="nc-print-btn" :disabled="disabled" @click="emitScaleAxis">Apply per-axis</button>
			</div>
			<div class="nc-print-tool-panel__actions">
				<button type="button" class="nc-print-btn nc-print-btn--sm" :disabled="disabled" title="Double the size" @click="$emit('scale-uniform', 2)">×2</button>
				<button type="button" class="nc-print-btn nc-print-btn--sm" :disabled="disabled" title="Halve the size" @click="$emit('scale-uniform', 0.5)">÷2</button>
			</div>
			<div class="nc-print-tool-panel__row">
				<label>To size
					<select v-model="toSize.axis" :disabled="disabled">
						<option value="x">X</option>
						<option value="y">Y</option>
						<option value="z">Z</option>
					</select>
				</label>
				<label>{{ unit }} <input v-model.number="toSize.value" type="number" min="0" step="0.5" :disabled="disabled"></label>
				<button type="button" class="nc-print-btn nc-print-btn--sm" :disabled="disabled" :title="`Switch to ${unit === 'mm' ? 'inches' : 'mm'}`" @click="toggleUnit">{{ unit }}</button>
				<button type="button" class="nc-print-btn" :disabled="disabled" @click="emitToSize">Apply</button>
			</div>
			<label class="nc-print-tool-panel__check">
				<input v-model="lockAspect" type="checkbox" :disabled="disabled"> Lock aspect ratio
			</label>
			<div class="nc-print-tool-panel__actions">
				<button type="button" class="nc-print-btn" :disabled="disabled" title="Uniform scale to fit build volume" @click="$emit('scale-to-fit')">Scale to fit bed</button>
				<button type="button" class="nc-print-btn" :disabled="disabled" title="Largest uniform scale that still fits the bed" @click="$emit('scale-max-fit')">Max fit</button>
				<button type="button" class="nc-print-btn" :disabled="disabled" @click="$emit('reset-scale')">Reset</button>
			</div>
			<p v-if="bbox" class="nc-print-tool-panel__hint">
				Current: {{ Math.round(bbox.x) }}×{{ Math.round(bbox.y) }}×{{ Math.round(bbox.z) }} mm
			</p>
		</div>

		<!-- Place on face -->
		<div v-else-if="tool === 'face'" class="nc-print-tool-panel__body">
			<button
				type="button"
				class="nc-print-btn"
				:class="{ 'nc-print-btn--primary': facePickActive }"
				:disabled="disabled"
				@click="$emit('face-pick-toggle', !facePickActive)">
				{{ facePickActive ? 'Picking… click a face' : 'Pick a face' }}
			</button>
			<p class="nc-print-tool-panel__hint">Click any facet on the model; that face rotates flat onto the plate.</p>
		</div>

		<!-- Mirror -->
		<div v-else-if="tool === 'mirror'" class="nc-print-tool-panel__body">
			<div class="nc-print-tool-panel__actions">
				<button type="button" class="nc-print-btn" :disabled="disabled" @click="$emit('mirror', 'x')">Mirror X</button>
				<button type="button" class="nc-print-btn" :disabled="disabled" @click="$emit('mirror', 'y')">Mirror Y</button>
				<button type="button" class="nc-print-btn" :disabled="disabled" @click="$emit('mirror', 'z')">Mirror Z</button>
			</div>
			<p class="nc-print-tool-panel__hint">Reflects the mesh and flips winding so normals stay outward.</p>
		</div>

		<!-- Cut -->
		<div v-else-if="tool === 'cut'" class="nc-print-tool-panel__body">
			<div class="nc-print-tool-panel__row">
				<label>Axis
					<select v-model="cut.axis" :disabled="disabled" @change="emitCutPreview">
						<option value="x">X</option>
						<option value="y">Y</option>
						<option value="z">Z</option>
					</select>
				</label>
				<label>Keep
					<select v-model="cut.keep" :disabled="disabled">
						<option value="both">Both parts</option>
						<option value="bottom">Bottom only</option>
						<option value="top">Top only</option>
					</select>
				</label>
			</div>
			<label class="nc-print-tool-panel__slider">
				Position {{ cut.pos }}%
				<input v-model.number="cut.pos" type="range" min="1" max="99" step="1" :disabled="disabled" @input="emitCutPreview">
			</label>
			<label class="nc-print-tool-panel__check">
				<input v-model="cut.cap" type="checkbox" :disabled="disabled"> Cap cross-section
			</label>
			<div class="nc-print-tool-panel__actions">
				<button type="button" class="nc-print-btn nc-print-btn--primary" :disabled="disabled" @click="emitCutApply">Apply cut</button>
			</div>
			<p class="nc-print-tool-panel__hint">Caps are exact for convex sections, best-effort otherwise.</p>
		</div>

		<!-- View -->
		<div v-else-if="tool === 'view'" class="nc-print-tool-panel__body">
			<div class="nc-print-tool-panel__actions">
				<button type="button" class="nc-print-btn nc-print-btn--sm" @click="$emit('camera', 'top')">Top</button>
				<button type="button" class="nc-print-btn nc-print-btn--sm" @click="$emit('camera', 'front')">Front</button>
				<button type="button" class="nc-print-btn nc-print-btn--sm" @click="$emit('camera', 'right')">Right</button>
				<button type="button" class="nc-print-btn nc-print-btn--sm" @click="$emit('camera', 'iso')">Iso</button>
				<button type="button" class="nc-print-btn nc-print-btn--sm" @click="$emit('camera', 'fit')">Fit</button>
			</div>
			<div class="nc-print-tool-panel__row">
				<label>Colour
					<input v-model="modelColor" type="color" @input="emitModelColor">
				</label>
			</div>
			<label class="nc-print-tool-panel__slider">
				Opacity {{ Math.round(modelOpacity * 100) }}%
				<input
					v-model.number="modelOpacity"
					type="range"
					min="0.1"
					max="1"
					step="0.05"
					@input="emitModelOpacity">
			</label>
			<label class="nc-print-tool-panel__check">
				<input v-model="wireframe" type="checkbox" @change="emitWireframe"> Wireframe
			</label>
			<label class="nc-print-tool-panel__check">
				<input v-model="section.enabled" type="checkbox" :disabled="disabled" @change="emitSection"> Section clip
			</label>
			<div v-if="section.enabled" class="nc-print-tool-panel__row">
				<label>Axis
					<select v-model="section.axis" :disabled="disabled" @change="onSectionAxis">
						<option value="x">X</option>
						<option value="y">Y</option>
						<option value="z">Z</option>
					</select>
				</label>
				<label class="nc-print-tool-panel__check">
					<input v-model="section.flip" type="checkbox" :disabled="disabled" @change="emitSection"> Flip
				</label>
			</div>
			<label v-if="section.enabled" class="nc-print-tool-panel__slider">
				Offset {{ Math.round(section.offset) }} mm
				<input
					v-model.number="section.offset"
					type="range"
					:min="axisRange.min"
					:max="axisRange.max"
					step="0.5"
					:disabled="disabled"
					@input="emitSection">
			</label>
		</div>

		<!-- Drill -->
		<div v-else-if="tool === 'drill'" class="nc-print-tool-panel__body">
			<p class="nc-print-tool-panel__hint">Set the hole, then click a face to drill.</p>
			<div class="nc-print-tool-panel__grid">
				<label>Ø mm <input v-model.number="drill.diameter" type="number" min="0.5" step="0.5" :disabled="disabled"></label>
				<label>Depth mm <input v-model.number="drill.depth" type="number" min="0.5" step="0.5" :disabled="disabled || drill.through"></label>
			</div>
			<label class="nc-print-tool-panel__check">
				<input v-model="drill.through" type="checkbox" :disabled="disabled"> Through hole
			</label>
			<button
				type="button"
				class="nc-print-btn nc-print-btn--primary"
				:class="{ 'nc-print-btn--active': drillArmed }"
				:disabled="disabled"
				@click="toggleDrill">
				{{ drillArmed ? 'Click a face… (cancel)' : 'Pick face to drill' }}
			</button>
		</div>

		<!-- Hollow -->
		<div v-else-if="tool === 'hollow'" class="nc-print-tool-panel__body">
			<p class="nc-print-tool-panel__hint">Shell the model to a wall thickness for less filament.</p>
			<div class="nc-print-tool-panel__grid">
				<label>Wall mm <input v-model.number="hollow.thickness" type="number" min="0.4" step="0.2" :disabled="disabled"></label>
				<label>Drain Ø mm <input v-model.number="hollow.drainDiameter" type="number" min="0" step="0.5" :disabled="disabled"></label>
			</div>
			<button type="button" class="nc-print-btn nc-print-btn--primary" :disabled="disabled" @click="emitHollow">
				Hollow model
			</button>
		</div>

		<!-- Emboss -->
		<div v-else-if="tool === 'emboss'" class="nc-print-tool-panel__body">
			<p class="nc-print-tool-panel__hint">Type text, then click a face to place it.</p>
			<label class="nc-print-tool-panel__field">Text
				<input v-model="emboss.text" type="text" maxlength="40" :disabled="disabled" placeholder="Label">
			</label>
			<div class="nc-print-tool-panel__grid">
				<label>Size mm <input v-model.number="emboss.size" type="number" min="1" step="0.5" :disabled="disabled"></label>
				<label>Depth mm <input v-model.number="emboss.depth" type="number" min="0.2" step="0.2" :disabled="disabled"></label>
			</div>
			<div class="nc-print-tool-panel__actions">
				<label class="nc-print-tool-panel__check">
					<input v-model="emboss.mode" type="radio" value="emboss" :disabled="disabled"> Raised
				</label>
				<label class="nc-print-tool-panel__check">
					<input v-model="emboss.mode" type="radio" value="deboss" :disabled="disabled"> Recessed
				</label>
			</div>
			<button
				type="button"
				class="nc-print-btn nc-print-btn--primary"
				:class="{ 'nc-print-btn--active': embossArmed }"
				:disabled="disabled || !emboss.text"
				@click="toggleEmboss">
				{{ embossArmed ? 'Click a face… (cancel)' : 'Pick face to place' }}
			</button>
		</div>

		<!-- Measure -->
		<div v-else-if="tool === 'measure'" class="nc-print-tool-panel__body">
			<p class="nc-print-tool-panel__hint">Click two points on the model to measure the distance.</p>
			<div v-if="bbox" class="nc-print-tool-panel__row">
				<span>Bounding box: {{ Math.round(bbox.x) }} × {{ Math.round(bbox.y) }} × {{ Math.round(bbox.z) }} mm</span>
			</div>
			<div class="nc-print-tool-panel__actions">
				<button
					type="button"
					class="nc-print-btn nc-print-btn--primary"
					:class="{ 'nc-print-btn--active': measureArmed }"
					:disabled="disabled"
					@click="toggleMeasure">
					{{ measureArmed ? 'Measuring… (cancel)' : 'Start measuring' }}
				</button>
				<button v-if="measureDistance != null" type="button" class="nc-print-btn nc-print-btn--sm" @click="$emit('measure-clear')">Clear</button>
			</div>
			<p v-if="measureDistance != null" class="nc-print-tool-panel__result">
				Distance: <strong>{{ measureDistance.toFixed(2) }} mm</strong>
			</p>
		</div>

		<!-- Arrange -->
		<div v-else-if="tool === 'arrange'" class="nc-print-tool-panel__body">
			<p class="nc-print-tool-panel__hint">Lay every object out on the bed without overlap.</p>
			<button type="button" class="nc-print-btn nc-print-btn--primary" :disabled="disabled" @click="$emit('arrange-all')">
				Arrange all objects
			</button>
		</div>
	</div>
</template>

<style scoped>
.nc-print-tool-panel {
	background: color-mix(in srgb, var(--nc-gcs-bg-elevated, #1b2027) 94%, transparent);
	border: 1px solid var(--nc-gcs-border);
	border-radius: var(--nc-gcs-radius-md, 8px);
	box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
	max-width: 280px;
	padding: 10px 12px;
	position: absolute;
	right: 8px;
	top: 8px;
	width: 260px;
	z-index: 5;
}

.nc-print-tool-panel__header {
	align-items: center;
	display: flex;
	justify-content: space-between;
	margin-bottom: 8px;
}

.nc-print-tool-panel__title {
	font-size: var(--nc-gcs-text-sm);
	font-weight: 600;
	margin: 0;
}

.nc-print-tool-panel__close {
	appearance: none;
	background: none;
	border: none;
	color: var(--nc-gcs-text-muted);
	cursor: pointer;
	font-size: 13px;
	line-height: 1;
	padding: 2px 4px;
}

.nc-print-tool-panel__close:hover {
	color: var(--nc-gcs-text-primary);
}

.nc-print-tool-panel__body {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.nc-print-tool-panel__grid {
	display: grid;
	gap: 6px;
	grid-template-columns: repeat(3, 1fr);
}

.nc-print-tool-panel__row {
	align-items: end;
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.nc-print-tool-panel__grid label,
.nc-print-tool-panel__row label {
	color: var(--nc-gcs-text-muted);
	display: flex;
	flex-direction: column;
	font-size: 11px;
	gap: 3px;
}

.nc-print-tool-panel__grid input,
.nc-print-tool-panel__row input[type="number"],
.nc-print-tool-panel__row select {
	max-width: 100%;
	width: 100%;
}

.nc-print-tool-panel__actions {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.nc-print-tool-panel__stack {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.nc-print-tool-panel__stack .nc-print-btn {
	width: 100%;
}

.nc-print-tool-panel__slider {
	color: var(--nc-gcs-text-muted);
	display: flex;
	flex-direction: column;
	font-size: 11px;
	gap: 4px;
}

.nc-print-tool-panel__slider input[type="range"] {
	width: 100%;
}

.nc-print-tool-panel__check {
	align-items: center;
	color: var(--nc-gcs-text-secondary);
	display: flex;
	font-size: 12px;
	gap: 6px;
}

.nc-print-tool-panel__hint {
	color: var(--nc-gcs-text-muted);
	font-size: 11px;
	margin: 0;
}

.nc-print-tool-panel__warn {
	color: var(--nc-gcs-danger-soft, #f87171);
	font-size: 11px;
	margin: 0;
}

.nc-print-btn--sm {
	font-size: 11px;
	padding: 3px 8px;
}

.nc-print-tool-panel--disabled {
	opacity: 0.6;
	pointer-events: none;
}
</style>
