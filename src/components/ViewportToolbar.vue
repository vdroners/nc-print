<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'

export default {
	name: 'ViewportToolbar',
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
		onApply() {
			this.$emit('apply')
		},
		onAutoApplyChange(e) {
			this.printStore.setMeshAutoApply(e.target.checked)
		},
	},
}
</script>

<template>
	<!-- Slimmed to the model-info line + auto-apply/Apply. Import, undo/redo, and
	     orient controls moved to the left "Import" section + the docked viewport
	     History box / Orient keypad (v1.54.0). -->
	<div class="nc-print-viewport-toolbar">
		<span v-if="printStore.hasModel" class="nc-print-viewport-toolbar__info">{{ infoLine }}</span>

		<label v-if="printStore.hasModel" class="nc-print-switch nc-print-viewport-toolbar__auto">
			<input
				type="checkbox"
				:checked="printStore.meshState.autoApply"
				@change="onAutoApplyChange">
			<span class="nc-print-switch__slider" />
			<span class="nc-print-switch__label">Auto-apply</span>
		</label>
		<button
			v-if="printStore.hasModel && !printStore.meshState.autoApply"
			type="button"
			class="nc-print-btn nc-print-btn--sm nc-print-btn--primary"
			:disabled="!printStore.meshState.dirty || printStore.meshState.applying"
			@click="onApply">
			Apply to slice
		</button>
	</div>
</template>

<style scoped>
.nc-print-viewport-toolbar {
	align-items: center;
	display: flex;
	flex-wrap: wrap;
	gap: var(--nc-gcs-space-sm);
}

.nc-print-viewport-toolbar__auto {
	margin-left: 4px;
}

.nc-print-viewport-toolbar__info {
	color: var(--nc-gcs-text-muted);
	font-size: var(--nc-gcs-text-sm);
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	max-width: 42ch;
}
</style>
