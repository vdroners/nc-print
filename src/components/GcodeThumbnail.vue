<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { moonrakerGet } from '@/services/moonraker-api.js'
import { generateUrl } from '@nextcloud/router'
import { thumbnailFromMetadata } from '@/utils/history.js'

/**
 * Renders the slicer-embedded thumbnail for a G-code file, fetched from
 * Moonraker `server/files/metadata`. A missing thumb, or a file URL that
 * fails (Moonraker 412 on `.thumbs/…png` is common), stays a quiet empty
 * frame — never the browser's broken-image glyph.
 */
export default {
	name: 'GcodeThumbnail',
	props: {
		filename: { type: String, default: '' },
		size: { type: Number, default: 96 },
	},
	data() {
		return { src: null, broken: false, _loadGen: 0 }
	},
	computed: {
		...mapStores(usePrintStore),
		printerId() {
			return this.printStore.selectedPrinterId || undefined
		},
		boxStyle() {
			return { width: `${this.size}px`, height: `${this.size}px` }
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
		onThumbError() {
			this.broken = true
			this.src = null
		},
		probe(url) {
			return new Promise((resolve) => {
				const img = new Image()
				img.onload = () => resolve(img.naturalWidth > 0)
				img.onerror = () => resolve(false)
				img.src = url
			})
		},
		async load() {
			const gen = ++this._loadGen
			this.src = null
			this.broken = false
			const name = String(this.filename || '').replace(/^\/+/, '')
			if (!name) {
				return
			}
			try {
				const meta = await moonrakerGet('server/files/metadata', { filename: name }, this.printerId)
				if (gen !== this._loadGen) {
					return
				}
				const next = thumbnailFromMetadata(meta, (p) => this.proxyUrl(p))
				if (!next) {
					return
				}
				// File URLs (Moonraker .thumbs often 412) are decoded off-screen
				// so a failure never paints the broken-image glyph.
				if (!next.startsWith('data:') && !(await this.probe(next))) {
					if (gen === this._loadGen) {
						this.broken = true
					}
					return
				}
				if (gen === this._loadGen) {
					this.src = next
				}
			} catch {
				if (gen === this._loadGen) {
					this.src = null
				}
			}
		},
	},
}
</script>

<template>
	<div
		class="nc-print-gcode-thumb"
		:class="{ 'nc-print-gcode-thumb--placeholder': !src || broken }"
		:style="boxStyle"
		aria-hidden="true">
		<img
			v-if="src && !broken"
			:src="src"
			alt=""
			:width="size"
			:height="size"
			loading="lazy"
			@error="onThumbError">
	</div>
</template>

<style scoped>
.nc-print-gcode-thumb {
	background: var(--nc-gcs-bg-app, rgba(0, 0, 0, 0.15));
	border: 1px solid var(--nc-gcs-border);
	border-radius: var(--nc-gcs-radius-sm, 4px);
	flex: 0 0 auto;
	overflow: hidden;
}

.nc-print-gcode-thumb--placeholder {
	background:
		linear-gradient(180deg, rgba(255, 255, 255, 0.04), transparent 70%),
		var(--nc-gcs-bg-elevated, rgba(0, 0, 0, 0.2));
}

.nc-print-gcode-thumb img {
	display: block;
	height: 100%;
	object-fit: contain;
	width: 100%;
}
</style>
