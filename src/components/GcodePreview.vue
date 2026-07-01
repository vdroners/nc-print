<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { parseGcodeLayers } from '@/services/gcode-toolpath.js'

export default {
	name: 'GcodePreview',
	props: {
		gcodeBlob: { type: [Blob, File], default: null },
	},
	data() {
		return {
			layerIndex: 0,
			layerCount: 0,
			layers: [],
			parseError: '',
			parsing: false,
		}
	},
	computed: {
		...mapStores(usePrintStore),
		canRetryDownload() {
			return !!this.printStore.sliceJob.jobId && !this.gcodeBlob
		},
	},
	watch: {
		gcodeBlob: {
			immediate: true,
			handler(blob) {
				void this.parseGcode(blob)
			},
		},
	},
	methods: {
		async parseGcode(blob) {
			this.layers = []
			this.layerCount = 0
			this.layerIndex = 0
			this.parseError = ''
			if (!blob) {
				this.parsing = false
				return
			}
			this.parsing = true
			try {
				const result = await parseGcodeLayers(blob)
				this.parseError = result.error
				this.layers = result.layers.map(l => l.lines)
				this.layerCount = result.layerCount
			} finally {
				this.parsing = false
			}
		},
		retryDownload() {
			void this.printStore.retryDownloadGcode()
		},
	},
}
</script>

<template>
	<div class="nc-print-gcode-preview">
		<h2 class="nc-print-card__title">G-code layer preview</h2>
		<p v-if="parsing" class="nc-print-gcode-preview__hint">Parsing G-code…</p>
		<p v-else-if="parseError" class="nc-print-gcode-preview__error">{{ parseError }}</p>
		<div v-else-if="!gcodeBlob" class="nc-print-gcode-preview__empty">
			<p class="nc-print-gcode-preview__hint">No G-code loaded for this job.</p>
			<button
				v-if="canRetryDownload"
				type="button"
				class="nc-print-link-btn"
				@click="retryDownload">
				Retry download
			</button>
		</div>
		<template v-else-if="layerCount > 0">
			<label class="nc-print-field">
				Layer
				<input v-model.number="layerIndex" type="range" min="0" :max="Math.max(0, layerCount - 1)">
				{{ layerIndex + 1 }} / {{ layerCount }}
			</label>
			<pre class="nc-print-gcode-preview__code">{{ (layers[layerIndex] || []).join('\n') }}</pre>
		</template>
		<p v-else class="nc-print-gcode-preview__hint">No layers found in G-code.</p>
	</div>
</template>

<style scoped>
.nc-print-gcode-preview__error {
	color: var(--nc-gcs-danger-soft);
	font-size: var(--nc-gcs-text-sm);
	margin: 0;
}

.nc-print-gcode-preview__hint {
	color: var(--nc-gcs-text-muted);
	font-size: var(--nc-gcs-text-sm);
	margin: 0;
}

.nc-print-gcode-preview__empty {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.nc-print-gcode-preview__code {
	background: var(--nc-gcs-bg-elevated);
	border-radius: var(--nc-gcs-radius-sm);
	font-size: 11px;
	max-height: 200px;
	overflow: auto;
	padding: 8px;
}

.nc-print-link-btn {
	appearance: none;
	background: none;
	border: none;
	color: var(--nc-app-accent);
	cursor: pointer;
	font: inherit;
	padding: 0;
	text-align: left;
	text-decoration: underline;
}
</style>
