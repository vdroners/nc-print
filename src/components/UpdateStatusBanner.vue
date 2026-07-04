<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { moonrakerGet } from '@/services/moonraker-api.js'

/**
 * Read-only firmware/component update banner from Moonraker's update_manager.
 * Shows how many managed items have updates available. Status only — this app
 * does NOT trigger updates (that stays in Mainsail/Fluidd/SSH by design).
 * Dismissible; hidden when update_manager is absent or everything is current.
 */
export default {
	name: 'UpdateStatusBanner',
	data() {
		return {
			outdated: [],
			dismissed: false,
		}
	},
	computed: {
		...mapStores(usePrintStore),
		printerId() {
			return this.printStore.selectedPrinterId || undefined
		},
		supported() {
			return this.printStore.hasFeature('update_manager')
		},
		connected() {
			return this.printStore.printerState.connected
		},
		show() {
			return this.supported && !this.dismissed && this.outdated.length > 0
		},
		label() {
			const names = this.outdated.join(', ')
			return `${this.outdated.length} update${this.outdated.length > 1 ? 's' : ''} available: ${names}`
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
				// machine/update/status is the modern path; fall back to the alt.
				let res
				try {
					res = await moonrakerGet('machine/update/status', { refresh: 'false' }, this.printerId)
				} catch {
					res = await moonrakerGet('machine/update_manager/status', {}, this.printerId)
				}
				const version = res?.result?.version_info ?? res?.version_info ?? {}
				const outdated = []
				for (const [name, info] of Object.entries(version)) {
					if (!info || typeof info !== 'object') {
						continue
					}
					const cur = info.current_version ?? info.version
					const remote = info.remote_version ?? info.latest_version
					if (cur && remote && String(cur) !== String(remote)) {
						outdated.push(name)
					}
				}
				this.outdated = outdated
			} catch (e) {
				this.outdated = []
			}
		},
	},
}
</script>

<template>
	<div v-if="show" class="nc-print-update-banner">
		<span class="nc-print-update-banner__icon">⬆</span>
		<span class="nc-print-update-banner__text">{{ label }}</span>
		<button type="button" class="nc-print-update-banner__dismiss" @click="dismissed = true">Dismiss</button>
	</div>
</template>

<style scoped>
.nc-print-update-banner {
	display: flex; align-items: center; gap: 10px;
	padding: 8px 12px; border-radius: 8px;
	background: color-mix(in srgb, var(--color-primary, #4c8eda) 14%, transparent);
	border: 1px solid color-mix(in srgb, var(--color-primary, #4c8eda) 40%, transparent);
	font-size: 0.84rem;
}
.nc-print-update-banner__text { flex: 1; }
.nc-print-update-banner__dismiss {
	appearance: none; border: none; background: none; color: inherit;
	font-size: 0.78rem; cursor: pointer; text-decoration: underline; opacity: 0.8;
}
</style>
