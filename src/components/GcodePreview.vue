<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'

const MAX_LINES = 400

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
		}
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
			if (!blob) {
				return
			}
			try {
				const text = await blob.text()
				const lines = text.split('\n')
				let current = []
				const found = []
				for (const line of lines) {
					if (line.startsWith(';LAYER:') || line.match(/^;LAYER\s+\d+/i)) {
						if (current.length) {
							found.push(current.slice(0, MAX_LINES))
						}
						current = [line]
					} else if (line.startsWith('G0') || line.startsWith('G1')) {
						current.push(line)
					}
				}
				if (current.length) {
					found.push(current.slice(0, MAX_LINES))
				}
				this.layers = found.length ? found : [lines.filter(l => l.startsWith('G')).slice(0, MAX_LINES)]
				this.layerCount = this.layers.length
			} catch {
				this.layers = []
			}
		},
	},
}
</script>

<template>
	<div v-if="layerCount > 0" class="nc-print-card nc-print-gcode-preview">
		<h2 class="nc-print-card__title">G-code layer preview</h2>
		<label class="nc-print-field">
			Layer
			<input v-model.number="layerIndex" type="range" min="0" :max="Math.max(0, layerCount - 1)">
			{{ layerIndex + 1 }} / {{ layerCount }}
		</label>
		<pre class="nc-print-gcode-preview__code">{{ (layers[layerIndex] || []).join('\n') }}</pre>
	</div>
</template>

<style scoped>
.nc-print-gcode-preview__code {
	background: var(--nc-gcs-bg-elevated);
	border-radius: var(--nc-gcs-radius-sm);
	font-size: 11px;
	max-height: 200px;
	overflow: auto;
	padding: 8px;
}
</style>
