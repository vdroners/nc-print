<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { printerPreset } from '@/services/analysis-api.js'
import MultiToolFilamentPicker from './MultiToolFilamentPicker.vue'

export default {
	name: 'ProfilePicker',
	components: { MultiToolFilamentPicker },
	data() {
		return {
			printerFilter: '',
			filamentFilter: '',
			processFilter: '',
			preset: null, // static model preset for the selected printer, or null
		}
	},
	watch: {
		'printStore.selection.printerId': {
			immediate: true,
			handler() {
				this.loadPreset()
			},
		},
	},
	computed: {
		...mapStores(usePrintStore),
		filteredPrinters() {
			return this.filterListWithSelection(
				this.printStore.profiles.printers,
				this.printerFilter,
				this.printStore.selection.printerId,
			)
		},
		filteredFilaments() {
			return this.filterListWithSelection(
				this.printStore.profiles.filaments,
				this.filamentFilter,
				this.printStore.selection.filamentId,
			)
		},
		filteredProcesses() {
			return this.filterListWithSelection(
				this.printStore.profiles.processes,
				this.processFilter,
				this.printStore.selection.processId,
			)
		},
		presetChip() {
			const p = this.preset
			if (!p) {
				return ''
			}
			const parts = []
			const bv = p.build_volume_mm
			if (Array.isArray(bv) && bv.length === 3) {
				parts.push(`${bv[0]}×${bv[1]}×${bv[2]}`)
			}
			if (p.nozzle_count > 0) {
				parts.push(`${p.nozzle_count} nozzle${p.nozzle_count > 1 ? 's' : ''}`)
			}
			if (p.chamber_heated) {
				parts.push('heated chamber')
			}
			return parts.join(' · ')
		},
	},
	methods: {
		filterList(list, query) {
			const q = String(query || '').trim().toLowerCase()
			if (!q) {
				return list
			}
			return list.filter(p => {
				const label = `${p.name || ''} ${p.id || ''} ${p.vendor || ''}`.toLowerCase()
				return label.includes(q)
			})
		},
		filterListWithSelection(list, query, selectedId) {
			const filtered = this.filterList(list, query)
			if (!selectedId) {
				return filtered
			}
			const selected = list.find(p => String(p.id) === String(selectedId))
			if (!selected || filtered.some(p => String(p.id) === String(selectedId))) {
				return filtered
			}
			return [selected, ...filtered]
		},
		optionLabel(p) {
			return `${p.name || p.id}${p.vendor ? ` — ${p.vendor}` : ''}`
		},
		onChange() {
			this.printStore.onProfileChange()
			this.loadPreset()
		},
		async loadPreset() {
			this.preset = null
			const id = this.printStore.selection.printerId
			const p = (this.printStore.profiles.printers || []).find(x => String(x.id) === String(id))
			const vendor = p?.vendor
			const model = p?.name || p?.id
			if (!vendor || !model) {
				return
			}
			try {
				this.preset = await printerPreset(vendor, model)
			} catch {
				this.preset = null
			}
		},
		focusField(kind) {
			const ids = {
				printer: 'nc-print-printer',
				filament: 'nc-print-filament',
				process: 'nc-print-process',
			}
			document.getElementById(ids[kind] || '')?.focus()
		},
	},
}
</script>

<template>
	<div class="nc-print-profile-picker">
		<div class="nc-print-field">
			<label for="nc-print-printer-filter">Slicer printer profile</label>
			<input
				id="nc-print-printer-filter"
				v-model="printerFilter"
				type="search"
				placeholder="Search printers…"
				autocomplete="off">
			<select
				id="nc-print-printer"
				v-model="printStore.selection.printerId"
				@change="onChange">
				<option v-if="filteredPrinters.length === 0" disabled value="">
					No matching printers
				</option>
				<option v-for="p in filteredPrinters" :key="p.id" :value="p.id">
					{{ optionLabel(p) }}
				</option>
			</select>
			<p v-if="presetChip" class="nc-print-profile-picker__preset" :title="preset._placeholder ? 'Model not yet shipped' : 'Known model specs'">
				📐 {{ presetChip }}{{ preset._placeholder ? ' (announced)' : '' }}
			</p>
		</div>
		<div class="nc-print-field">
			<label for="nc-print-filament-filter">Filament</label>
			<input
				id="nc-print-filament-filter"
				v-model="filamentFilter"
				type="search"
				placeholder="Search filaments…"
				autocomplete="off">
			<select
				id="nc-print-filament"
				v-model="printStore.selection.filamentId"
				@change="onChange">
				<option v-if="filteredFilaments.length === 0" disabled value="">
					No matching filaments
				</option>
				<option v-for="f in filteredFilaments" :key="f.id" :value="f.id">
					{{ optionLabel(f) }}
				</option>
			</select>
		</div>
		<MultiToolFilamentPicker />
		<div class="nc-print-field">
			<label for="nc-print-process-filter">Process / quality</label>
			<input
				id="nc-print-process-filter"
				v-model="processFilter"
				type="search"
				placeholder="Search processes…"
				autocomplete="off">
			<select
				id="nc-print-process"
				v-model="printStore.selection.processId"
				@change="onChange">
				<option v-if="filteredProcesses.length === 0" disabled value="">
					No matching processes
				</option>
				<option v-for="p in filteredProcesses" :key="p.id" :value="p.id">
					{{ optionLabel(p) }}
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

.nc-print-field input[type='search'] {
	margin-bottom: 4px;
}

.nc-print-profile-picker__preset {
	margin: 4px 0 0;
	font-size: 0.74rem;
	color: var(--nc-gcs-text-muted, #8b949e);
}
</style>
