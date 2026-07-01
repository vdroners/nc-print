<script>
export default {
	name: 'ModelViewport',
	props: {
		modelName: { type: String, default: '' },
	},
	data() {
		return {
			rotation: 0,
		}
	},
	mounted() {
		this._draw()
		this._anim = requestAnimationFrame(this._tick)
	},
	beforeDestroy() {
		if (this._anim) {
			cancelAnimationFrame(this._anim)
		}
	},
	methods: {
		_tick() {
			this.rotation += 0.003
			this._draw()
			this._anim = requestAnimationFrame(this._tick)
		},
		_draw() {
			const canvas = this.$refs.canvas
			if (!canvas) {
				return
			}
			const ctx = canvas.getContext('2d')
			const dpr = window.devicePixelRatio || 1
			const w = canvas.clientWidth
			const h = canvas.clientHeight
			canvas.width = w * dpr
			canvas.height = h * dpr
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

			ctx.fillStyle = '#161b22'
			ctx.fillRect(0, 0, w, h)

			// Bed grid
			const gridStep = 20
			ctx.strokeStyle = 'rgba(34, 197, 94, 0.15)'
			ctx.lineWidth = 1
			for (let x = 0; x <= w; x += gridStep) {
				ctx.beginPath()
				ctx.moveTo(x, 0)
				ctx.lineTo(x, h)
				ctx.stroke()
			}
			for (let y = 0; y <= h; y += gridStep) {
				ctx.beginPath()
				ctx.moveTo(0, y)
				ctx.lineTo(w, y)
				ctx.stroke()
			}

			// Placeholder model block (isometric-ish)
			const cx = w / 2
			const cy = h * 0.55
			const size = Math.min(w, h) * 0.18
			const tilt = Math.sin(this.rotation) * 0.08

			ctx.save()
			ctx.translate(cx, cy)
			ctx.transform(1, tilt, -tilt * 0.5, 1, 0, 0)

			ctx.fillStyle = 'rgba(34, 197, 94, 0.55)'
			ctx.strokeStyle = '#22c55e'
			ctx.lineWidth = 2
			ctx.fillRect(-size / 2, -size, size, size)
			ctx.strokeRect(-size / 2, -size, size, size)

			ctx.fillStyle = 'rgba(34, 197, 94, 0.35)'
			ctx.beginPath()
			ctx.moveTo(-size / 2, -size)
			ctx.lineTo(0, -size - size * 0.35)
			ctx.lineTo(size / 2, -size)
			ctx.closePath()
			ctx.fill()
			ctx.stroke()

			ctx.restore()

			if (this.modelName) {
				ctx.fillStyle = '#8b949e'
				ctx.font = '12px Inter, sans-serif'
				ctx.textAlign = 'center'
				ctx.fillText(this.modelName, cx, h - 16)
			} else {
				ctx.fillStyle = '#8b949e'
				ctx.font = '13px Inter, sans-serif'
				ctx.textAlign = 'center'
				ctx.fillText('Import a model to preview', cx, cy + size + 24)
			}
		},
	},
}
</script>

<template>
	<div class="nc-print-viewport-wrap">
		<canvas ref="canvas" aria-label="3D model viewport placeholder" />
	</div>
</template>

<style scoped>
canvas {
	min-height: 320px;
}
</style>
