<script>
import { parseGcodeLayers } from '@/services/gcode-toolpath.js'

const TRAVEL_COLOR = '#888888'

export default {
	name: 'ToolpathScrubber',
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
	watch: {
		gcodeBlob: {
			immediate: true,
			handler(blob) {
				void this.loadGcode(blob)
			},
		},
		layerIndex() {
			this.$nextTick(() => this.drawLayer())
		},
		layerCount() {
			this.$nextTick(() => this.observeCanvas())
		},
	},
	mounted() {
		this._ro = typeof ResizeObserver !== 'undefined'
			? new ResizeObserver(() => this.drawLayer())
			: null
		this.observeCanvas()
	},
	beforeDestroy() {
		this._ro?.disconnect()
	},
	methods: {
		observeCanvas() {
			if (!this._ro) {
				return
			}
			this._ro.disconnect()
			if (this.$refs.canvas) {
				this._ro.observe(this.$refs.canvas)
			}
		},
		async loadGcode(blob) {
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
				this.layers = result.layers
				this.layerCount = result.layerCount
				this.$nextTick(() => {
					this.observeCanvas()
					this.drawLayer()
				})
			} finally {
				this.parsing = false
			}
		},
		drawLayer() {
			const canvas = this.$refs.canvas
			if (!canvas) {
				return
			}
			const layer = this.layers[this.layerIndex]
			const ctx = canvas.getContext('2d')
			if (!ctx || !layer?.segments?.length) {
				ctx?.clearRect(0, 0, canvas.width, canvas.height)
				if (ctx && !layer?.segments?.length && this.layerCount > 0) {
					ctx.fillStyle = '#888888'
					ctx.font = '12px sans-serif'
					ctx.textAlign = 'center'
					ctx.fillText('No motion on this layer', canvas.width / 2, canvas.height / 2)
				}
				return
			}

			const dpr = window.devicePixelRatio || 1
			const rect = canvas.getBoundingClientRect()
			const w = Math.max(1, rect.width)
			const h = Math.max(1, rect.height)
			canvas.width = w * dpr
			canvas.height = h * dpr
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
			ctx.clearRect(0, 0, w, h)

			const { bounds, segments } = layer
			const pad = 12
			const spanX = Math.max(bounds.maxX - bounds.minX, 1)
			const spanY = Math.max(bounds.maxY - bounds.minY, 1)
			const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY)
			const offX = pad + (w - pad * 2 - spanX * scale) / 2 - bounds.minX * scale
			const offY = pad + (h - pad * 2 - spanY * scale) / 2 - bounds.minY * scale

			const toScreen = (x, y) => ({
				x: x * scale + offX,
				y: h - (y * scale + offY),
			})

			ctx.lineCap = 'round'
			ctx.lineJoin = 'round'
			for (const seg of segments) {
				const a = toScreen(seg.x0, seg.y0)
				const b = toScreen(seg.x1, seg.y1)
				ctx.beginPath()
				ctx.moveTo(a.x, a.y)
				ctx.lineTo(b.x, b.y)
				ctx.strokeStyle = seg.extruding
					? 'var(--nc-app-accent, #22c55e)'
					: TRAVEL_COLOR
				ctx.lineWidth = seg.extruding ? 1.4 : 0.8
				ctx.stroke()
			}
		},
	},
}
</script>

<template>
	<div class="nc-print-toolpath-scrubber">
		<h2 class="nc-print-card__title">Toolpath</h2>
		<p v-if="parsing" class="nc-print-toolpath-scrubber__hint">Parsing toolpath…</p>
		<p v-else-if="parseError" class="nc-print-toolpath-scrubber__error">{{ parseError }}</p>
		<template v-else-if="layerCount > 0">
			<label class="nc-print-field nc-print-toolpath-scrubber__slider">
				Layer
				<input v-model.number="layerIndex" type="range" min="0" :max="Math.max(0, layerCount - 1)">
				<span>{{ layerIndex + 1 }} / {{ layerCount }}</span>
			</label>
			<canvas ref="canvas" class="nc-print-toolpath-scrubber__canvas" aria-label="G-code layer toolpath" />
		</template>
		<p v-else-if="gcodeBlob" class="nc-print-toolpath-scrubber__error">No layers found in G-code.</p>
		<p v-else class="nc-print-toolpath-scrubber__hint">Slice a model to preview toolpaths layer by layer.</p>
	</div>
</template>

<style scoped>
.nc-print-toolpath-scrubber {
	display: flex;
	flex-direction: column;
	gap: var(--nc-gcs-space-sm);
	min-height: 0;
}

.nc-print-toolpath-scrubber__canvas {
	background: var(--nc-gcs-bg-elevated);
	border: 1px solid var(--nc-gcs-border);
	border-radius: var(--nc-gcs-radius-sm);
	display: block;
	flex: 1 1 auto;
	min-height: 220px;
	width: 100%;
}

.nc-print-toolpath-scrubber__slider {
	margin-bottom: 0;
}

.nc-print-toolpath-scrubber__error,
.nc-print-toolpath-scrubber__hint {
	color: var(--nc-gcs-text-muted);
	font-size: var(--nc-gcs-text-sm);
	margin: 0;
}
</style>
