<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'

export default {
	name: 'ViewportToolbar',
	props: {
		canCenter: { type: Boolean, default: false },
		canTransform: { type: Boolean, default: false },
	},
	computed: {
		...mapStores(usePrintStore),
		infoLine() {
			if (!this.printStore.hasModel) {
				return 'No model loaded'
			}
			const kb = Math.round(this.printStore.model.size / 1024)
			let line = `${this.printStore.model.name} (${kb} KB)`
			const bbox = this.printStore.modelMeta.bbox
			if (bbox) {
				line += ` · ${Math.round(bbox.x)}×${Math.round(bbox.y)}×${Math.round(bbox.z)} mm`
			}
			if (this.printStore.meshHealth.analyzed) {
				line += ` · ${this.printStore.meshHealth.overhangPct}% overhang`
			}
			if (this.printStore.model.convertedFrom3mf) {
				line += ' · 3MF→STL for slice'
			}
			if (this.printStore.meshState.dirty && !this.printStore.meshState.autoApply) {
				line += ' · transform pending apply'
			}
			if (this.printStore.meshState.applying) {
				line += ' · applying…'
			}
			return line
		},
	},
	methods: {
		onImportClick() {
			this.$refs.fileInput?.click()
		},
		onFileInput(e) {
			const file = e.target.files?.[0]
			if (file) {
				this.$emit('import', file)
			}
			e.target.value = ''
		},
		onPickFiles() {
			this.$emit('pick-files')
		},
		onCenter() {
			this.$emit('center')
		},
		onRotate(axis) {
			this.$emit('rotate', axis)
		},
		onAutoOrient() {
			this.$emit('auto-orient')
		},
		onLayFlat() {
			this.$emit('lay-flat')
		},
		onScaleToFit() {
			this.$emit('scale-to-fit')
		},
		onClear() {
			this.printStore.clearModel()
			this.$emit('clear')
		},
		onApply() {
			this.$emit('apply')
		},
		onAutoApplyChange(e) {
			this.printStore.setMeshAutoApply(e.target.checked)
		},
		onUndo() {
			this.$emit('undo')
		},
		onRedo() {
			this.$emit('redo')
		},
		onResetTransform() {
			this.$emit('reset-transform')
		},
	},
}
</script>

<template>
	<div class="nc-print-viewport-toolbar">
		<!-- Group 1: file -->
		<div class="nc-print-toolbar-group">
			<button type="button" class="nc-print-btn" @click="onImportClick">
				Import STL/3MF/OBJ
			</button>
			<input
				ref="fileInput"
				type="file"
				accept=".stl,.3mf,.obj"
				hidden
				aria-label="Import model file"
				@change="onFileInput">
			<button type="button" class="nc-print-btn" @click="onPickFiles">
				From Files
			</button>
			<button
				v-if="printStore.hasModel"
				type="button"
				class="nc-print-btn"
				@click="onClear">
				Clear
			</button>
		</div>

		<!-- Group 1b: undo/redo + object ops -->
		<div v-if="printStore.hasModel" class="nc-print-toolbar-group">
			<button
				type="button"
				class="nc-print-btn nc-print-btn--compact"
				:disabled="!printStore.meshCanUndo"
				title="Undo (Ctrl+Z)"
				aria-label="Undo"
				@click="onUndo">
				↶ Undo
			</button>
			<button
				type="button"
				class="nc-print-btn nc-print-btn--compact"
				:disabled="!printStore.meshCanRedo"
				title="Redo (Ctrl+Shift+Z)"
				aria-label="Redo"
				@click="onRedo">
				↷ Redo
			</button>
			<button
				type="button"
				class="nc-print-btn nc-print-btn--compact"
				:disabled="!canTransform"
				title="Reset all transforms"
				@click="onResetTransform">
				Reset
			</button>
		</div>

		<!-- Group 2: view -->
		<div v-if="printStore.hasModel" class="nc-print-toolbar-group">
			<button
				type="button"
				class="nc-print-btn"
				:disabled="!canCenter"
				title="Center on bed and drop to z=0"
				@click="onCenter">
				Center on bed
			</button>
		</div>

		<!-- Group 3: orient -->
		<div v-if="printStore.hasModel" class="nc-print-toolbar-group">
			<span v-if="printStore.hasModel" class="nc-print-viewport-toolbar__rotate">
				<button type="button" class="nc-print-btn nc-print-btn--compact" title="Rotate 90° around X" @click="onRotate('x')">↻ X</button>
				<button type="button" class="nc-print-btn nc-print-btn--compact" title="Rotate 90° around Y" @click="onRotate('y')">↻ Y</button>
				<button type="button" class="nc-print-btn nc-print-btn--compact" title="Rotate 90° around Z" @click="onRotate('z')">↻ Z</button>
			</span>
			<button
				type="button"
				class="nc-print-btn"
				:disabled="!canTransform"
				title="Place largest face on the bed"
				@click="onLayFlat">
				Lay flat
			</button>
			<button
				type="button"
				class="nc-print-btn"
				:disabled="!canTransform"
				title="Uniform scale to fit build volume"
				@click="onScaleToFit">
				Scale to fit
			</button>
			<button
				type="button"
				class="nc-print-btn"
				:disabled="!canTransform"
				title="Pick lowest-overhang axis-aligned rotation"
				@click="onAutoOrient">
				Auto-orient
			</button>
		</div>

		<!-- Group 4: apply -->
		<div v-if="printStore.hasModel" class="nc-print-toolbar-group">
			<label v-if="printStore.hasModel" class="nc-print-switch nc-print-viewport-toolbar__auto">
				<input
					type="checkbox"
					:checked="printStore.meshState.autoApply"
					@change="onAutoApplyChange">
				<span class="nc-print-switch__slider" />
				<span class="nc-print-switch__label">Auto-apply on edit</span>
			</label>
			<button
				v-if="printStore.hasModel && !printStore.meshState.autoApply"
				type="button"
				class="nc-print-btn nc-print-btn--primary"
				:disabled="!printStore.meshState.dirty || printStore.meshState.applying"
				@click="onApply">
				Apply to slice
			</button>
		</div>

		<span v-if="printStore.hasModel" class="nc-print-viewport-toolbar__info">{{ infoLine }}</span>
	</div>
</template>

<style scoped>
.nc-print-viewport-toolbar {
	align-items: center;
	display: flex;
	flex-wrap: wrap;
	gap: var(--nc-gcs-space-sm);
	margin-bottom: var(--nc-gcs-space-sm);
}

.nc-print-toolbar-group {
	align-items: center;
	display: flex;
	flex-wrap: wrap;
	gap: var(--nc-gcs-space-sm);
}

.nc-print-toolbar-group + .nc-print-toolbar-group {
	border-left: 1px solid var(--nc-gcs-border);
	padding-left: var(--nc-gcs-space-sm);
}

.nc-print-viewport-toolbar__rotate {
	display: inline-flex;
	flex-wrap: wrap;
	gap: 4px;
}

.nc-print-viewport-toolbar__auto {
	margin-left: 4px;
}

.nc-print-viewport-toolbar__info {
	color: var(--nc-gcs-text-muted);
	flex: 1 1 200px;
	font-size: var(--nc-gcs-text-sm);
	margin-left: auto;
	min-width: 160px;
	text-align: right;
}

:deep(.nc-print-btn--compact) {
	font-size: 11px;
	min-width: 0;
	padding: 4px 8px;
}
</style>
