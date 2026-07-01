<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'

export default {
	name: 'ProfilePicker',
	computed: {
		...mapStores(usePrintStore),
	},
	methods: {
		onChange() {
			this.printStore.onProfileChange()
		},
	},
}
</script>

<template>
	<div class="nc-print-profile-picker">
		<div class="nc-print-field">
			<label for="nc-print-printer">Printer</label>
			<select
				id="nc-print-printer"
				v-model="printStore.selection.printerId"
				@change="onChange">
				<option v-for="p in printStore.profiles.printers" :key="p.id" :value="p.id">
					{{ p.name || p.id }}{{ p.vendor ? ` — ${p.vendor}` : '' }}
				</option>
			</select>
		</div>
		<div class="nc-print-field">
			<label for="nc-print-filament">Filament</label>
			<select
				id="nc-print-filament"
				v-model="printStore.selection.filamentId"
				@change="onChange">
				<option v-for="f in printStore.profiles.filaments" :key="f.id" :value="f.id">
					{{ f.name || f.id }}{{ f.vendor ? ` — ${f.vendor}` : '' }}
				</option>
			</select>
		</div>
		<div class="nc-print-field">
			<label for="nc-print-process">Process / quality</label>
			<select
				id="nc-print-process"
				v-model="printStore.selection.processId"
				@change="onChange">
				<option v-for="p in printStore.profiles.processes" :key="p.id" :value="p.id">
					{{ p.name || p.id }}{{ p.vendor ? ` — ${p.vendor}` : '' }}
				</option>
			</select>
		</div>
	</div>
</template>

<style scoped>
.nc-print-profile-picker {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
	gap: var(--nc-gcs-space-md);
}
</style>
