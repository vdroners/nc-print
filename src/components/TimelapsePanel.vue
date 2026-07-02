<script>
import { mapStores } from 'pinia'
import { generateUrl } from '@nextcloud/router'
import { usePrintStore } from '@/store/print.js'
import { moonrakerGet } from '@/services/moonraker-api.js'
import NcPrintIcon from './NcPrintIcon.vue'
import { parseTimelapseList, timelapseSupported, formatBytes } from '@/utils/timelapse.js'

export default {
	name: 'TimelapsePanel',
	components: { NcPrintIcon },
	data() {
		return {
			videos: [],
			checked: false,
			loadError: '',
			selected: null,
		}
	},
	computed: {
		...mapStores(usePrintStore),
		printerId() {
			return this.printStore.selectedPrinterId || undefined
		},
		connected() {
			return this.printStore.printerState.connected
		},
		// WS16: only show when moonraker-timelapse is detected on the host.
		supported() {
			return timelapseSupported(this.printStore.printerFeatures)
		},
	},
	watch: {
		connected(now) {
			if (now) {
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
		formatBytes,
		videoUrl(video) {
			// Rendered videos live under the Moonraker `timelapse` file root,
			// served (read-only) through the proxy allowlist's server/files/ prefix.
			const base = generateUrl('/apps/nc_print/api/moonraker')
			const q = this.printerId ? `?printer_id=${encodeURIComponent(this.printerId)}` : ''
			return `${base}/server/files/timelapse/${encodeURI(video.path)}${q}`
		},
		async load() {
			try {
				const data = await moonrakerGet('server/files/list', { root: 'timelapse' }, this.printerId)
				this.videos = parseTimelapseList(data)
				this.loadError = ''
				if (this.videos.length && !this.selected) {
					this.selected = this.videos[0]
				}
			} catch (e) {
				this.loadError = e?.message || 'Timelapse unavailable'
			} finally {
				this.checked = true
			}
		},
		select(video) {
			this.selected = video
		},
	},
}
</script>

<template>
	<div v-if="connected && supported" class="nc-print-card nc-print-timelapse">
		<div class="nc-print-card__header">
			<h2 class="nc-print-card__title">
				<span class="nc-print-card__title-row">
					<NcPrintIcon name="video" :size="18" />
					Timelapse
				</span>
			</h2>
			<button
				type="button"
				class="nc-print-btn nc-print-btn--sm"
				:disabled="!checked"
				title="Refresh rendered videos"
				@click="load">
				Refresh
			</button>
		</div>

		<p v-if="loadError" class="nc-print-timelapse__msg">{{ loadError }}</p>

		<template v-else-if="videos.length">
			<video
				v-if="selected"
				:key="selected.path"
				class="nc-print-timelapse__player"
				controls
				preload="metadata"
				:src="videoUrl(selected)" />

			<ul class="nc-print-timelapse__list">
				<li
					v-for="video in videos"
					:key="video.path"
					:class="['nc-print-timelapse__item', { 'is-selected': selected && selected.path === video.path }]">
					<button type="button" class="nc-print-timelapse__pick" @click="select(video)">
						<span class="nc-print-timelapse__name">{{ video.filename }}</span>
						<span class="nc-print-timelapse__meta">{{ formatBytes(video.sizeBytes) }}</span>
					</button>
					<a
						class="nc-print-btn nc-print-btn--sm nc-print-btn--ghost"
						:href="videoUrl(video)"
						:download="video.filename"
						title="Download">
						<NcPrintIcon name="download" :size="14" />
					</a>
				</li>
			</ul>
		</template>

		<p v-else-if="checked" class="nc-print-timelapse__msg">
			No rendered timelapses yet. One is created after your next print.
		</p>
	</div>
</template>

<style scoped>
.nc-print-timelapse__player {
	background: #000;
	border-radius: var(--nc-gcs-radius, 8px);
	display: block;
	margin-bottom: 12px;
	max-height: 320px;
	width: 100%;
}

.nc-print-timelapse__list {
	display: flex;
	flex-direction: column;
	gap: 4px;
	list-style: none;
	margin: 0;
	padding: 0;
}

.nc-print-timelapse__item {
	align-items: center;
	border-radius: var(--nc-gcs-radius-sm, 6px);
	display: flex;
	gap: 8px;
	padding: 2px;
}

.nc-print-timelapse__item.is-selected {
	background: var(--nc-gcs-surface-hover, rgba(127, 127, 127, 0.12));
}

.nc-print-timelapse__pick {
	align-items: center;
	background: none;
	border: none;
	color: inherit;
	cursor: pointer;
	display: flex;
	flex: 1;
	gap: 8px;
	justify-content: space-between;
	min-width: 0;
	padding: 6px 8px;
	text-align: left;
}

.nc-print-timelapse__name {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.nc-print-timelapse__meta {
	color: var(--nc-gcs-text-muted);
	flex: none;
	font-size: var(--nc-gcs-text-xs, 11px);
}

.nc-print-timelapse__msg {
	color: var(--nc-gcs-text-muted);
	font-size: var(--nc-gcs-text-sm);
}
</style>
