<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { moonrakerGet, moonrakerProxyPost } from '@/services/moonraker-api.js'
import { toastError } from '@/services/toast.js'

/**
 * Power-device control (smart plug / PSU relay / etc.) via Moonraker's [power]
 * component. Read status + toggle on/off through the already-allowlisted
 * machine/device_power/ proxy path. Only shown when the printer reports the
 * `power` component (feature-detected).
 */
export default {
	name: 'PowerDevicePanel',
	data() {
		return {
			devices: [],
			loadError: '',
			busy: {},
		}
	},
	computed: {
		...mapStores(usePrintStore),
		printerId() {
			return this.printStore.selectedPrinterId || undefined
		},
		supported() {
			return this.printStore.hasFeature('power')
		},
		connected() {
			return this.printStore.printerState.connected
		},
		printing() {
			return this.printStore.printerControls?.isActive
		},
	},
	watch: {
		connected(now) {
			if (now && this.supported) {
				void this.load()
			}
		},
	},
	mounted() {
		if (this.connected && this.supported) {
			void this.load()
		}
	},
	methods: {
		async load() {
			try {
				const res = await moonrakerGet('machine/device_power/devices', {}, this.printerId)
				const list = res?.result?.devices ?? res?.devices ?? []
				this.devices = Array.isArray(list) ? list : []
				this.loadError = ''
			} catch (e) {
				this.loadError = e?.message || 'Could not load power devices'
			}
		},
		isOn(dev) {
			return String(dev.status || '').toLowerCase() === 'on'
		},
		async toggle(dev) {
			// Never let the UI cut power to the host/printer mid-print.
			if (this.printing) {
				toastError('Cannot switch power devices while printing')
				return
			}
			const action = this.isOn(dev) ? 'off' : 'on'
			this.$set(this.busy, dev.device, true)
			try {
				await moonrakerProxyPost(
					`machine/device_power/device?device=${encodeURIComponent(dev.device)}&action=${action}`,
					{},
					this.printerId,
				)
				await this.load()
			} catch (e) {
				toastError('Power switch failed', e)
			} finally {
				this.$set(this.busy, dev.device, false)
			}
		},
	},
}
</script>

<template>
	<div v-if="supported" class="nc-print-power">
		<h3 class="nc-print-power__title">Power devices</h3>
		<p v-if="loadError" class="nc-print-power__error">{{ loadError }}</p>
		<p v-else-if="!devices.length" class="nc-print-power__hint">No power devices reported.</p>
		<ul v-else class="nc-print-power__list">
			<li v-for="dev in devices" :key="dev.device" class="nc-print-power__item">
				<span class="nc-print-power__name">{{ dev.device }}</span>
				<span class="nc-print-power__state" :class="{ 'is-on': isOn(dev) }">{{ isOn(dev) ? 'On' : 'Off' }}</span>
				<button
					type="button"
					class="nc-print-power__btn"
					:disabled="busy[dev.device] || printing"
					:title="printing ? 'Disabled while printing' : ''"
					@click="toggle(dev)">
					{{ isOn(dev) ? 'Turn off' : 'Turn on' }}
				</button>
			</li>
		</ul>
	</div>
</template>

<style scoped>
.nc-print-power__title { font-size: var(--nc-gcs-text-sm); font-weight: 600; margin: var(--nc-gcs-space-sm) 0; }
.nc-print-power__hint, .nc-print-power__error { font-size: 0.8rem; color: var(--color-text-maxcontrast, #8b949e); margin: 0; }
.nc-print-power__error { color: var(--color-error, #e5534b); }
.nc-print-power__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.nc-print-power__item { display: flex; align-items: center; gap: 10px; }
.nc-print-power__name { flex: 1; font-size: 0.85rem; }
.nc-print-power__state { font-size: 0.74rem; color: var(--color-text-maxcontrast, #8b949e); }
.nc-print-power__state.is-on { color: var(--color-success, #4caf50); }
.nc-print-power__btn {
	appearance: none; border: 1px solid var(--color-border, #30363d); border-radius: 6px;
	background: var(--color-background-hover, #21262d); color: inherit; padding: 4px 12px;
	font-size: 0.78rem; cursor: pointer;
}
.nc-print-power__btn:disabled { opacity: 0.5; cursor: default; }
</style>
