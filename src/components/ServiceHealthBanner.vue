<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'

export default {
	name: 'ServiceHealthBanner',
	computed: {
		...mapStores(usePrintStore),
		collapsedWhenHealthy() {
			return this.printStore.appStatus.slicer_ok && this.printStore.appStatus.moonraker_ok
		},
		bannerClass() {
			const s = this.printStore.appStatus
			if (!s.slicer_enabled || !s.slicer_ok) {
				return 'nc-print-health-banner--danger'
			}
			if (!s.moonraker_enabled || !s.moonraker_ok) {
				return 'nc-print-health-banner--warn'
			}
			return 'nc-print-health-banner--ok'
		},
		message() {
			const s = this.printStore.appStatus
			if (!s.loaded) {
				return 'Checking slicer and printer services…'
			}
			if (!s.slicer_enabled) {
				return 'Slicer integration disabled in Admin settings.'
			}
			if (!s.slicer_ok) {
				return `Slicer offline${s.slicer_error ? ` (${s.slicer_error})` : ''} — see docs/TROUBLESHOOTING.md`
			}
			if (!s.moonraker_enabled) {
				return 'Moonraker integration disabled in Admin settings.'
			}
			if (!s.moonraker_ok) {
				return `Printer unreachable${s.moonraker_error ? ` (${s.moonraker_error})` : ''} — check K1 / Moonraker URL in Admin.`
			}
			return 'Slicer and printer connected'
		},
	},
}
</script>

<template>
	<div
		v-if="printStore.appStatus.loaded && !collapsedWhenHealthy"
		class="nc-print-health-banner"
		:class="bannerClass"
		role="status">
		{{ message }}
	</div>
</template>
