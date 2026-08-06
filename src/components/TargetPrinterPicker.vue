<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'

export default {
	name: 'TargetPrinterPicker',
	props: {
		variant: {
			type: String,
			default: 'print',
			validator: v => ['prepare', 'print', 'modal'].includes(v),
		},
		showScan: { type: Boolean, default: true },
		showManualConnect: { type: Boolean, default: true },
		label: { type: String, default: '' },
		selectId: { type: String, default: 'nc-print-target-printer' },
	},
	data() {
		return {
			manualHost: '',
		}
	},
	computed: {
		...mapStores(usePrintStore),
		groups() {
			return this.printStore.printerPickerGroups
		},
		hasDiscovered() {
			return this.groups.discovered.length > 0
		},
		capabilityLabel() {
			return this.printStore.activePrinterCapabilityLabel
		},
		fieldLabel() {
			if (this.label) {
				return this.label
			}
			return this.variant === 'print' ? 'Send to printer' : 'Send-to printer (Moonraker)'
		},
		connectionLabel() {
			return this.printStore.targetConnectionLabel
		},
		connectionClass() {
			return this.printStore.targetConnectionClass
		},
		showFoundHint() {
			return this.variant !== 'modal'
		},
		scanDoneEmpty() {
			return !this.printStore.discovering
				&& !this.printStore.discoverError
				&& this.printStore.lastDiscoverCount === 0
				&& this.printStore.lastDiscoverAt > 0
		},
		// Wave B cold-start: nothing configured and nothing found yet — replace
		// the empty dropdown with a guided setup card.
		noPrintersAtAll() {
			return this.groups.configured.length === 0
				&& this.groups.recent.length === 0
				&& !this.hasDiscovered
		},
		adminSettingsUrl() {
			try {
				// eslint-disable-next-line no-undef
				return OC.generateUrl('/settings/admin/nc_print')
			} catch {
				return '/settings/admin/nc_print'
			}
		},
	},
	mounted() {
		void this.printStore.fetchPrinterCapabilities(this.printStore.selectedPrinterId)
	},
	methods: {
		onChange() {
			this.printStore.onPrinterTargetChange()
		},
		async scan() {
			await this.printStore.discoverPrinters()
		},
		async connectManual() {
			const id = await this.printStore.connectPrinterByHost(this.manualHost)
			if (id) {
				this.manualHost = ''
			}
		},
		addFound(found) {
			void this.printStore.addDiscoveredPrinter(found)
		},
	},
}
</script>

<template>
	<div class="nc-print-field nc-print-multi-printer" :class="`nc-print-multi-printer--${variant}`">
		<div class="nc-print-multi-printer__row">
			<label :for="selectId">{{ fieldLabel }}</label>
			<button
				v-if="showScan"
				type="button"
				class="nc-print-multi-printer__scan"
				:disabled="printStore.discovering"
				:aria-label="printStore.discovering ? 'Scanning for printers' : 'Scan for printers'"
				@click="scan">
				{{ printStore.discovering ? 'Scanning…' : 'Scan for printers' }}
			</button>
		</div>

		<div v-if="noPrintersAtAll" class="nc-print-multi-printer__setup">
			<p class="nc-print-multi-printer__setup-title">No printer connected yet</p>
			<p class="nc-print-multi-printer__setup-body">
				Slicing works without one — connect a Moonraker/Klipper printer when
				you're ready to send the print.
			</p>
			<div class="nc-print-multi-printer__setup-actions">
				<button
					type="button"
					class="nc-print-btn nc-print-btn--primary"
					:disabled="printStore.discovering"
					@click="scan">
					{{ printStore.discovering ? 'Scanning…' : 'Scan the network' }}
				</button>
				<a class="nc-print-btn" :href="adminSettingsUrl">Admin settings</a>
			</div>
			<p class="nc-print-multi-printer__setup-hint">
				…or type the printer's hostname / IP under Connect by IP below.
			</p>
		</div>

		<select
			v-else
			:id="selectId"
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

		<p v-if="connectionLabel" class="nc-print-multi-printer__conn" :class="connectionClass">
			{{ connectionLabel }}
		</p>

		<p v-if="capabilityLabel" class="nc-print-multi-printer__caps">
			{{ capabilityLabel }}
		</p>

		<p v-if="printStore.discoverError" class="nc-print-multi-printer__error">
			{{ printStore.discoverError }}
		</p>

		<p v-else-if="scanDoneEmpty" class="nc-print-multi-printer__empty">
			No Moonraker printers found on the network.
			<span v-if="printStore.config?.discovery_subnet">
				Scanned {{ printStore.config.discovery_subnet }}0/24 from the server.
			</span>
			<span v-else>
				Try Connect by IP below, or set discovery subnet in Admin → NC 3D Print.
			</span>
		</p>

		<div v-if="showManualConnect" class="nc-print-multi-printer__manual">
			<label for="nc-print-manual-host">Connect by IP</label>
			<div class="nc-print-multi-printer__manual-row">
				<input
					id="nc-print-manual-host"
					v-model="manualHost"
					type="text"
					inputmode="decimal"
					class="nc-print-multi-printer__manual-input"
					placeholder="printer.local or IP"
					:disabled="printStore.discovering"
					@keydown.enter.prevent="connectManual">
				<button
					type="button"
					class="nc-print-multi-printer__scan"
					:disabled="printStore.discovering || !manualHost.trim()"
					@click="connectManual">
					Connect
				</button>
			</div>
		</div>

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
			<p v-if="showFoundHint" class="nc-print-multi-printer__found-hint">
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
.nc-print-multi-printer--modal {
	margin-bottom: 0;
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
.nc-print-multi-printer__conn {
	margin: 4px 0 0;
	font-size: 0.74rem;
}
.nc-print-multi-printer__conn.is-online {
	color: var(--color-success, #4caf50);
}
.nc-print-multi-printer__conn.is-reconnecting {
	color: var(--color-warning, #e5a50a);
}
.nc-print-multi-printer__conn.is-offline {
	color: var(--color-text-maxcontrast, #8b949e);
}
.nc-print-multi-printer__caps {
	margin: 4px 0 0;
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast, #8b949e);
}
.nc-print-multi-printer__error {
	margin: 4px 0 0;
	font-size: 0.78rem;
	color: var(--color-error, #e5534b);
}
.nc-print-multi-printer__empty {
	margin: 4px 0 0;
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast, #8b949e);
}
.nc-print-multi-printer__setup {
	border: 1px dashed var(--color-border, #30363d);
	border-radius: 8px;
	padding: 10px 12px;
	margin-top: 4px;
}
.nc-print-multi-printer__setup-title {
	margin: 0 0 4px;
	font-size: 0.85rem;
	font-weight: 600;
}
.nc-print-multi-printer__setup-body {
	margin: 0 0 8px;
	font-size: 0.76rem;
	color: var(--color-text-maxcontrast, #8b949e);
}
.nc-print-multi-printer__setup-actions {
	display: flex;
	gap: 8px;
	flex-wrap: wrap;
}
.nc-print-multi-printer__setup-actions .nc-print-btn {
	font-size: 0.78rem;
	padding: 4px 12px;
	text-decoration: none;
}
.nc-print-multi-printer__setup-hint {
	margin: 8px 0 0;
	font-size: 0.7rem;
	color: var(--color-text-maxcontrast, #8b949e);
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
.nc-print-multi-printer__manual {
	margin-top: var(--nc-gcs-space-sm);
}
.nc-print-multi-printer__manual-row {
	display: flex;
	gap: 8px;
	margin-top: 4px;
}
.nc-print-multi-printer__manual-input {
	flex: 1;
	min-width: 0;
	border: 1px solid var(--color-border, #30363d);
	border-radius: 6px;
	background: var(--color-main-background, #0d1117);
	color: inherit;
	padding: 6px 10px;
	font-size: 0.85rem;
}
</style>
