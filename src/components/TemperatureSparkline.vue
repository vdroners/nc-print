<script>
import { sparklineGeometry, SPARKLINE_WINDOW_MS } from '@/utils/temperature.js'

export default {
	name: 'TemperatureSparkline',
	props: {
		samples: {
			type: Array,
			default: () => [],
		},
		color: { type: String, default: '#22c55e' },
		label: { type: String, default: '' },
		height: { type: Number, default: 120 },
	},
	watch: {
		samples: {
			deep: true,
			handler() {
				this.$nextTick(() => this.draw())
			},
		},
	},
	mounted() {
		this._drawnWidth = 0
		this._drawing = false
		const canvas = this.$refs.canvas
		if (canvas && typeof ResizeObserver !== 'undefined') {
			this._ro = new ResizeObserver(() => {
				const width = canvas.clientWidth || 0
				if (width === this._drawnWidth) {
					return
				}
				this.draw()
			})
			this._ro.observe(canvas)
		}
		this.draw()
	},
	beforeDestroy() {
		if (this._ro) {
			this._ro.disconnect()
			this._ro = null
		}
	},
	methods: {
		draw() {
			if (this._drawing) {
				return
			}
			const canvas = this.$refs.canvas
			if (!canvas) {
				return
			}
			const ctx = canvas.getContext('2d')
			if (!ctx) {
				return
			}
			const width = canvas.clientWidth
			// A hidden panel reports 0. Drawing into a few pixels and letting
			// CSS stretch it later shows up as a stray tick.
			if (width < 8) {
				this._drawnWidth = 0
				return
			}
			this._drawing = true
			try {
				const dpr = window.devicePixelRatio || 1
				const height = this.height
				canvas.width = Math.floor(width * dpr)
				canvas.height = Math.floor(height * dpr)
				ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
				ctx.clearRect(0, 0, width, height)
				this._drawnWidth = width

				const layout = sparklineGeometry(this.samples, {
					width,
					height,
					now: Date.now(),
					windowMs: SPARKLINE_WINDOW_MS,
				})
				if (!layout.ready) {
					ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)'
					ctx.setLineDash([4, 4])
					ctx.beginPath()
					ctx.moveTo(0, height / 2)
					ctx.lineTo(width, height / 2)
					ctx.stroke()
					ctx.setLineDash([])
					ctx.fillStyle = 'rgba(203, 213, 225, 0.95)'
					ctx.font = '13px sans-serif'
					ctx.textAlign = 'center'
					ctx.textBaseline = 'middle'
					ctx.fillText('Collecting…', width / 2, height / 2 - 8)
					return
				}

				ctx.strokeStyle = this.color
				ctx.lineWidth = 2
				ctx.lineJoin = 'round'
				ctx.lineCap = 'round'
				ctx.beginPath()
				layout.commands.forEach((p, i) => {
					if (i === 0) {
						ctx.moveTo(p.x, p.y)
					} else {
						ctx.lineTo(p.x, p.y)
					}
				})
				ctx.stroke()
			} finally {
				this._drawing = false
			}
		},
	},
}
</script>

<template>
	<div class="nc-print-temp-sparkline">
		<span v-if="label" class="nc-print-temp-sparkline__label">{{ label }}</span>
		<canvas ref="canvas" class="nc-print-temp-sparkline__canvas" :style="{ height: height + 'px' }" />
	</div>
</template>

<style scoped>
.nc-print-temp-sparkline {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-width: 0;
}

.nc-print-temp-sparkline__label {
	color: var(--nc-gcs-text-primary, #e6edf3);
	font-size: 13px;
	font-weight: 600;
}

.nc-print-temp-sparkline__canvas {
	background: var(--nc-gcs-bg-app, rgba(0, 0, 0, 0.2));
	border-radius: 4px;
	display: block;
	width: 100%;
}
</style>
