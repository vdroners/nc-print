<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'

export default {
	name: 'MultiPrinterPicker',
	computed: {
		...mapStores(usePrintStore),
		groups() {
			return this.printStore.printerPickerGroups
		},
		hasConfigured() {
			return this.printStore.configuredPrinters.length > 1
		},
		hasDiscovered() {
			return this.groups.discovered.length > 0
		},
		// Show the control if there's a real choice OR discovery is worth
		// offering (so a single-printer setup can still scan for more).
		show() {
			return this.hasConfigured || this.hasDiscovered || true
		},
	},
	methods: {
		onChange() {
			this.printStore.onPrinterTargetChange()
		},
		async scan() {
			await this.printStore.discoverPrinters()
		},
		addFound(found) {
			this.printStore.addDiscoveredPrinter(found)
		},
	},
}
</script>

<template>
	<div v-if="show" class="nc-print-field nc-print-multi-printer">
		<div class="nc-print-multi-printer__row">
			<label for="nc-print-target-printer">Send to printer</label>
			<button
				type="button"
				class="nc-print-multi-printer__scan"
				:disabled="printStore.discovering"
				@click="scan">
				{{ printStore.discovering ? 'Scanning…' : '🔍 Scan for printers' }}
			</button>
		</div>

		<select
			id="nc-print-target-printer"
			v-model="printStore.selectedPrinterId"
			@change="onChange">
			<optgroup v-if="groups.recent.length" label="Recent">
				<option v-for="p in groups.recent" :key="'recent-' + p.id" :value="p.id">
					{{ p.name || p.id }}
				</option>
			</optgroup>
			<optgroup :label="groups.recent.length ? 'All printers' : 'Configured'">
				<option v-for="p in groups.configured" :key="'cfg-' + p.id" :value="p.id">
					{{ p.name || p.id }}{{ p.default ? ' ★' : '' }}
				</option>
			</optgroup>
		</select>

		<p v-if="printStore.discoverError" class="nc-print-multi-printer__error">
			{{ printStore.discoverError }}
		</p>

		<div v-if="hasDiscovered" class="nc-print-multi-printer__found">
			<p class="nc-print-multi-printer__found-title">Found on network</p>
			<ul class="nc-print-multi-printer__found-list">
				<li v-for="d in groups.discovered" :key="d.id" class="nc-print-multi-printer__found-item">
					<span class="nc-print-multi-printer__found-name">
						{{ d.name }}
						<span class="nc-print-multi-printer__found-host">{{ d.moonraker_url }}</span>
					</span>
					<span
						class="nc-print-multi-printer__found-state"
						:class="{ 'is-ready': d.klippy_state === 'ready' }">
						{{ d.klippy_state }}
					</span>
					<button type="button" class="nc-print-multi-printer__add" @click="addFound(d)">
						Use
					</button>
				</li>
			</ul>
			<p class="nc-print-multi-printer__found-hint">
				Added for this session. An admin can save it permanently in
				Settings → NC 3D Print.
			</p>
		</div>
	</div>
</template>

<style scoped>
.nc-print-multi-printer {
	margin-bottom: var(--nc-gcs-space-sm);
}
.nc-print-multi-printer__row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}
.nc-print-multi-printer__scan {
	appearance: none;
	border: 1px solid var(--color-border, #30363d);
	border-radius: 6px;
	background: var(--color-background-hover, #21262d);
	color: inherit;
	padding: 3px 10px;
	font-size: 0.76rem;
	cursor: pointer;
}
.nc-print-multi-printer__scan:disabled {
	opacity: 0.6;
	cursor: default;
}
.nc-print-multi-printer__error {
	margin: 4px 0 0;
	font-size: 0.78rem;
	color: var(--color-error, #e5534b);
}
.nc-print-multi-printer__found {
	margin-top: 8px;
	padding: 8px 10px;
	border: 1px solid var(--color-border, #30363d);
	border-radius: 8px;
	background: var(--color-background-dark, #161b22);
}
.nc-print-multi-printer__found-title {
	margin: 0 0 6px;
	font-size: 0.72rem;
	text-transform: uppercase;
	letter-spacing: 0.03em;
	color: var(--color-text-maxcontrast, #8b949e);
}
.nc-print-multi-printer__found-list {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 6px;
}
.nc-print-multi-printer__found-item {
	display: flex;
	align-items: center;
	gap: 8px;
}
.nc-print-multi-printer__found-name {
	flex: 1;
	display: flex;
	flex-direction: column;
	font-size: 0.82rem;
}
.nc-print-multi-printer__found-host {
	font-size: 0.7rem;
	color: var(--color-text-maxcontrast, #8b949e);
}
.nc-print-multi-printer__found-state {
	font-size: 0.7rem;
	color: var(--color-text-maxcontrast, #8b949e);
	text-transform: capitalize;
}
.nc-print-multi-printer__found-state.is-ready {
	color: var(--color-success, #4caf50);
}
.nc-print-multi-printer__add {
	appearance: none;
	border: 1px solid var(--nc-app-accent, #4c8eda);
	border-radius: 6px;
	background: color-mix(in srgb, var(--nc-app-accent, #4c8eda) 18%, transparent);
	color: inherit;
	padding: 3px 12px;
	font-size: 0.76rem;
	cursor: pointer;
}
.nc-print-multi-printer__found-hint {
	margin: 6px 0 0;
	font-size: 0.7rem;
	color: var(--color-text-maxcontrast, #8b949e);
}
</style>
