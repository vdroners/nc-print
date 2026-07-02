<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { moonrakerGet } from '@/services/moonraker-api.js'
import { generateUrl } from '@nextcloud/router'
import { thumbnailFromMetadata } from '@/utils/history.js'

/**
 * Renders the slicer-embedded thumbnail for a G-code file, fetched from
 * Moonraker `server/files/metadata`. Silent when no thumbnail exists.
 */
export default {
	name: 'GcodeThumbnail',
	props: {
		filename: { type: String, default: '' },
		size: { type: Number, default: 96 },
	},
	data() {
		return { src: null }
	},
	computed: {
		...mapStores(usePrintStore),
		printerId() {
			return this.printStore.selectedPrinterId || undefined
		},
	},
	watch: {
		filename: {
			immediate: true,
			handler() {
				void this.load()
			},
		},
	},
	methods: {
		proxyUrl(relativePath) {
			const url = generateUrl(`/apps/nc_print/api/moonraker/server/files/gcodes/${relativePath}`)
			return this.printerId ? `${url}?printer_id=${encodeURIComponent(this.printerId)}` : url
		},
		async load() {
			this.src = null
			const name = String(this.filename || '').replace(/^\/+/, '')
			if (!name) {
				return
			}
			try {
				const meta = await moonrakerGet('server/files/metadata', { filename: name }, this.printerId)
				this.src = thumbnailFromMetadata(meta, (p) => this.proxyUrl(p))
			} catch {
				this.src = null
			}
		},
	},
}
</script>

<template>
	<img
		v-if="src"
		class="nc-print-gcode-thumb"
		:src="src"
		:width="size"
		:height="size"
		alt="G-code preview"
		loading="lazy">
</template>

<style scoped>
.nc-print-gcode-thumb {
	background: var(--nc-gcs-bg-app, rgba(0, 0, 0, 0.15));
	border: 1px solid var(--nc-gcs-border);
	border-radius: var(--nc-gcs-radius-sm, 4px);
	object-fit: contain;
}
</style>
