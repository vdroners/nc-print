<script>
const WINDOW_MS = 5 * 60 * 1000

export default {
	name: 'TemperatureSparkline',
	props: {
		samples: {
			type: Array,
			default: () => [],
		},
		color: { type: String, default: '#22c55e' },
		label: { type: String, default: '' },
		height: { type: Number, default: 48 },
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
		this.draw()
	},
	methods: {
		draw() {
			const canvas = this.$refs.canvas
			if (!canvas) {
				return
			}
			const ctx = canvas.getContext('2d')
			if (!ctx) {
				return
			}
			const dpr = window.devicePixelRatio || 1
			const width = canvas.clientWidth || 200
			const height = this.height
			canvas.width = Math.floor(width * dpr)
			canvas.height = Math.floor(height * dpr)
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
			ctx.clearRect(0, 0, width, height)

			const now = Date.now()
			const cutoff = now - WINDOW_MS
			const points = (this.samples || [])
				.filter(p => p && typeof p.value === 'number' && p.t >= cutoff)
				.sort((a, b) => a.t - b.t)

			if (points.length < 2) {
				// Canvas 2D does not understand CSS var()/color-mix(); use a concrete
				// muted colour so the "collecting" baseline is actually visible on the
				// dark surface, and label it so the empty state reads as intentional.
				ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)'
				ctx.setLineDash([4, 4])
				ctx.beginPath()
				ctx.moveTo(0, height / 2)
				ctx.lineTo(width, height / 2)
				ctx.stroke()
				ctx.setLineDash([])
				ctx.fillStyle = 'rgba(148, 163, 184, 0.7)'
				ctx.font = '11px sans-serif'
				ctx.textAlign = 'center'
				ctx.textBaseline = 'middle'
				ctx.fillText('Collecting…', width / 2, height / 2 - 8)
				return
			}

			const values = points.map(p => p.value)
			const min = Math.min(...values)
			const max = Math.max(...values)
			const span = Math.max(max - min, 5)

			ctx.strokeStyle = this.color
			ctx.lineWidth = 1.5
			ctx.beginPath()
			points.forEach((p, i) => {
				const x = ((p.t - cutoff) / WINDOW_MS) * width
				const y = height - ((p.value - min) / span) * (height - 4) - 2
				if (i === 0) {
					ctx.moveTo(x, y)
				} else {
					ctx.lineTo(x, y)
				}
			})
			ctx.stroke()
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
}

.nc-print-temp-sparkline__label {
	color: var(--nc-gcs-text-muted);
	font-size: 11px;
}

.nc-print-temp-sparkline__canvas {
	display: block;
	width: 100%;
}
</style>
