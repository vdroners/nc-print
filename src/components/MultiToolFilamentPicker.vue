<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import FlushMatrixPanel from './FlushMatrixPanel.vue'

export default {
	name: 'MultiToolFilamentPicker',
	components: { FlushMatrixPanel },
	computed: {
		...mapStores(usePrintStore),
		extruderCount() {
			return this.printStore.extruderCount
		},
		show() {
			return this.extruderCount > 1
		},
		toolSlots() {
			const n = this.extruderCount
			return Array.from({ length: n }, (_, i) => i)
		},
	},
	methods: {
		onChange() {
			this.printStore.onProfileChange()
		},
	},
}
</script>

<template>
	<div v-if="show" class="nc-print-multi-tool">
		<p class="nc-print-multi-tool__hint">
			This printer profile has {{ extruderCount }} extruders — assign filament per tool.
		</p>
		<div
			v-for="idx in toolSlots"
			:key="'tool-' + idx"
			class="nc-print-field">
			<label :for="'nc-print-filament-t' + idx">Tool T{{ idx }} filament</label>
			<select
				:id="'nc-print-filament-t' + idx"
				v-model="printStore.selection.filamentIds[idx]"
				@change="onChange">
				<option v-for="f in printStore.profiles.filaments" :key="f.id" :value="f.id">
					{{ f.name || f.id }}{{ f.vendor ? ` — ${f.vendor}` : '' }}
				</option>
			</select>
		</div>
		<FlushMatrixPanel />
	</div>
</template>

<style scoped>
.nc-print-multi-tool {
	border-top: 1px solid var(--nc-gcs-border);
	margin-top: var(--nc-gcs-space-sm);
	padding-top: var(--nc-gcs-space-sm);
}

.nc-print-multi-tool__hint {
	color: var(--nc-gcs-text-muted);
	font-size: var(--nc-gcs-text-sm);
	margin: 0 0 var(--nc-gcs-space-sm);
}
</style>
