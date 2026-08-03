<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { moonrakerGet } from '@/services/moonraker-api.js'

/**
 * Moonraker service announcements (klipper/moonraker bulletins). Read-only,
 * dismissible per-entry for the session. Hidden when the announcements
 * component is absent or there are no active entries.
 */
export default {
	name: 'AnnouncementsBanner',
	data() {
		return {
			entries: [],
			dismissed: [],
		}
	},
	computed: {
		...mapStores(usePrintStore),
		printerId() {
			return this.printStore.selectedPrinterId || undefined
		},
		supported() {
			return this.printStore.hasFeature('announcements')
		},
		connected() {
			return this.printStore.printerState.connected
		},
		visible() {
			return this.entries.filter(e => !this.dismissed.includes(e.entry_id))
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
				const res = await moonrakerGet('server/announcements/list', {}, this.printerId)
				const list = res?.result?.entries ?? res?.entries ?? []
				this.entries = (Array.isArray(list) ? list : [])
					.filter(e => !e.dismissed)
					.map(e => ({
						entry_id: e.entry_id,
						title: e.title || 'Announcement',
						url: e.url || '',
					}))
			} catch (e) {
				this.entries = []
			}
		},
		dismiss(id) {
			this.dismissed.push(id)
		},
	},
}
</script>

<template>
	<div v-if="visible.length" class="nc-print-announcements">
		<div v-for="e in visible" :key="e.entry_id" class="nc-print-announcements__item">
			<span class="nc-print-announcements__icon">📣</span>
			<a v-if="e.url" :href="e.url" target="_blank" rel="noopener noreferrer" class="nc-print-announcements__title">{{ e.title }}</a>
			<span v-else class="nc-print-announcements__title">{{ e.title }}</span>
			<button type="button" class="nc-print-announcements__dismiss" @click="dismiss(e.entry_id)">Dismiss</button>
		</div>
	</div>
</template>

<style scoped>
.nc-print-announcements { display: flex; flex-direction: column; gap: 6px; }
.nc-print-announcements__item {
	display: flex; align-items: center; gap: 10px;
	padding: 8px 12px; border-radius: 8px;
	background: color-mix(in srgb, var(--color-warning) 12%, transparent);
	border: 1px solid color-mix(in srgb, var(--color-warning) 35%, transparent);
	font-size: 0.84rem;
}
.nc-print-announcements__title { flex: 1; }
.nc-print-announcements__dismiss {
	appearance: none; border: none; background: none; color: inherit;
	font-size: 0.78rem; cursor: pointer; text-decoration: underline; opacity: 0.8;
}
</style>
