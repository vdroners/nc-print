<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { moonrakerGet, triggerUpdate } from '@/services/moonraker-api.js'
import { toastError, toastSuccess } from '@/services/toast.js'

/**
 * Admin-only control to TRIGGER Moonraker updates (the read-only status lives in
 * UpdateStatusBanner). Every trigger restarts printer services, so it is:
 *   - hidden for non-admins (server also enforces admin),
 *   - disabled while a print is active,
 *   - behind an explicit confirm.
 * Shown only when update_manager is present.
 */
const TARGET_LABELS = {
	klipper: 'Klipper',
	moonraker: 'Moonraker',
	client: 'Web client',
	system: 'System packages',
}

export default {
	name: 'UpdateControlPanel',
	data() {
		return {
			outdated: [],
			busyTarget: '',
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
		isAdmin() {
			// UI gate only; the server enforces admin regardless.
			return typeof window !== 'undefined' && !!(window.OC && window.OC.isUserAdmin && window.OC.isUserAdmin())
		},
		printing() {
			return !!this.printStore.printerControls?.isActive
		},
		connected() {
			return this.printStore.printerState.connected
		},
		show() {
			return this.supported && this.isAdmin
		},
		targets() {
			// Offer only components that actually have an update available.
			return this.outdated.map(name => ({ name, label: TARGET_LABELS[name] || name }))
		},
	},
	watch: {
		connected(now) {
			if (now && this.show) {
				void this.loadStatus()
			}
		},
	},
	mounted() {
		if (this.connected && this.show) {
			void this.loadStatus()
		}
	},
	methods: {
		async loadStatus() {
			try {
				let res
				try {
					res = await moonrakerGet('machine/update/status', { refresh: 'false' }, this.printerId)
				} catch {
					res = await moonrakerGet('machine/update_manager/status', {}, this.printerId)
				}
				const version = res?.result?.version_info ?? res?.version_info ?? {}
				const out = []
				for (const [name, info] of Object.entries(version)) {
					if (!info || typeof info !== 'object') {
						continue
					}
					const cur = info.current_version ?? info.version
					const remote = info.remote_version ?? info.latest_version
					if (cur && remote && String(cur) !== String(remote)) {
						out.push(name)
					}
				}
				this.outdated = out
			} catch (e) {
				this.outdated = []
			}
		},
		async run(target) {
			if (this.printing) {
				toastError('Cannot update while printing')
				return
			}
			const label = target === 'full' ? 'ALL components' : (TARGET_LABELS[target] || target)
			// eslint-disable-next-line no-alert
			if (!window.confirm(`Update ${label}? This restarts printer services and can take several minutes.`)) {
				return
			}
			this.busyTarget = target
			try {
				await triggerUpdate(target, this.printerId)
				toastSuccess(`Update started: ${label} (services will restart)`)
			} catch (e) {
				toastError('Update failed', e)
			} finally {
				this.busyTarget = ''
			}
		},
	},
}
</script>

<template>
	<div v-if="show && targets.length" class="nc-print-update-ctl nc-print-card">
		<h3 class="nc-print-update-ctl__title">Updates available (admin)</h3>
		<p class="nc-print-update-ctl__hint">Restarts printer services. Disabled while printing.</p>
		<div class="nc-print-update-ctl__row">
			<button
				v-for="t in targets"
				:key="t.name"
				type="button"
				class="nc-print-btn nc-print-btn--sm"
				:disabled="!!busyTarget || printing"
				@click="run(t.name)">
				{{ busyTarget === t.name ? 'Updating…' : ('Update ' + t.label) }}
			</button>
			<button
				type="button"
				class="nc-print-btn nc-print-btn--sm nc-print-update-ctl__all"
				:disabled="!!busyTarget || printing"
				@click="run('full')">
				{{ busyTarget === 'full' ? 'Updating…' : 'Update all' }}
			</button>
		</div>
	</div>
</template>

<style scoped>
.nc-print-update-ctl__title { font-size: var(--nc-gcs-text-sm); font-weight: 600; margin: var(--nc-gcs-space-sm) 0 4px; }
.nc-print-update-ctl__hint { font-size: 0.74rem; color: var(--color-text-maxcontrast, #8b949e); margin: 0 0 8px; }
.nc-print-update-ctl__row { display: flex; flex-wrap: wrap; gap: 8px; }
.nc-print-update-ctl__all { border-color: var(--nc-app-accent, #4c8eda); }
</style>
