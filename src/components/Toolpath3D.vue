<template>
	<div class="tp3d" :class="{ 'tp3d--immersive': immersive }">
		<div v-if="loading" class="tp3d__status">Loading toolpath…</div>
		<div v-else-if="error" class="tp3d__status tp3d__status--error">{{ error }}</div>

		<div class="tp3d__viewport" ref="wrap">
			<canvas ref="canvas" class="tp3d__canvas" />
		</div>

		<div v-if="ready" class="tp3d__controls">
			<div class="tp3d__layerrow">
				<label class="tp3d__label" :for="sliderId">Top</label>
				<input
					:id="sliderId"
					class="tp3d__slider"
					type="range"
					min="0"
					:max="layerCount - 1"
					:value="currentLayer"
					@input="onLayer($event.target.value)">
				<span class="tp3d__layernum">{{ currentLayer + 1 }} / {{ layerCount }}</span>
			</div>
			<div class="tp3d__layerrow">
				<label class="tp3d__label" :for="minId">Bottom</label>
				<input
					:id="minId"
					class="tp3d__slider"
					type="range"
					min="0"
					:max="layerCount - 1"
					:value="minLayer"
					@input="onMinLayer($event.target.value)">
				<span class="tp3d__layernum">{{ minLayer + 1 }}</span>
			</div>
			<div v-show="minLayer === 0" class="tp3d__layerrow">
				<label class="tp3d__label" :for="moveId">Moves</label>
				<input
					:id="moveId"
					class="tp3d__slider"
					type="range"
					min="0"
					:max="topLayerMoves"
					:value="currentMove"
					@input="onMove($event.target.value)">
				<span class="tp3d__layernum">{{ currentMove }} / {{ topLayerMoves }}</span>
			</div>
			<!-- Color-by: Feature | Speed (speed only when the sidecar emits it). -->
			<div class="tp3d__colorrow">
				<span class="tp3d__label">Color by</span>
				<button
					type="button"
					class="tp3d__modebtn"
					:class="{ 'tp3d__modebtn--on': colorMode === 'feature' }"
					@click="setColorMode('feature')">Feature</button>
				<button
					type="button"
					class="tp3d__modebtn"
					:class="{ 'tp3d__modebtn--on': colorMode === 'speed' }"
					:disabled="!speedRange"
					:title="speedRange ? 'Colour by print speed' : 'Speed data unavailable — re-slice'"
					@click="setColorMode('speed')">Speed</button>
				<span v-if="colorMode === 'speed' && speedRange" class="tp3d__gradient">
					<span
						v-for="(s, i) in speedLegendStops()"
						:key="i"
						class="tp3d__gradstop"
						:style="{ background: s.color }">{{ s.label }}</span>
					<span class="tp3d__gradunit">mm/s</span>
				</span>
			</div>
			<div v-show="colorMode === 'feature'" class="tp3d__legend">
				<button
					v-for="feat in features"
					:key="feat"
					type="button"
					class="tp3d__chip"
					:class="{ 'tp3d__chip--off': !visible[feat] }"
					@click="toggleFeature(feat)">
					<span class="tp3d__swatch" :style="{ background: swatch(feat) }" />
					{{ labelFor(feat) }}
				</button>
			</div>
		</div>
	</div>
</template>

<script>
import { createViewport } from '@/three/viewport.js'
import {
	fetchToolpath,
	presentFeatures,
	colorForSpeed,
	FEATURE_COLORS,
	FEATURE_LABELS,
} from '@/services/toolpath-3d.js'

let _uid = 0

export default {
	name: 'Toolpath3D',
	props: {
		jobId: { type: String, default: '' },
		buildVolume: { type: Array, default: () => [220, 220, 220] },
		/**
		 * 'panel'     — classic stacked card (viewport above, controls below).
		 * 'immersive' — viewport fills the background; the layer slider + feature
		 *               legend float as a bottom overlay bar (Slice full-bleed).
		 */
		mode: {
			type: String,
			default: 'panel',
			validator: (v) => ['panel', 'immersive'].includes(v),
		},
	},
	computed: {
		immersive() {
			return this.mode === 'immersive'
		},
	},
	data() {
		return {
			viewport: null,
			loading: false,
			error: '',
			ready: false,
			layerCount: 0,
			currentLayer: 0,
			minLayer: 0, // bottom of the visible band (0 = show from the first layer)
			features: [],
			visible: {},
			sliderId: `tp3d-layer-${++_uid}`,
			minId: `tp3d-min-${++_uid}`,
			moveId: `tp3d-move-${++_uid}`,
			colorMode: 'feature', // 'feature' | 'speed'
			speedRange: null, // { min, max } when the sidecar emits speeds
			tp: null, // last fetched toolpath (for re-render on colorMode switch)
			topLayerMoves: 0, // segment count in the current top layer (move slider max)
			currentMove: 0,
		}
	},
	watch: {
		jobId() {
			this.reload()
		},
	},
	async mounted() {
		try {
			this.viewport = await createViewport(this.$refs.canvas, this.$refs.wrap)
			this.viewport.setBedVolume(this.buildVolume)
			if (this.jobId) {
				await this.reload()
			}
		} catch (e) {
			this.error = e?.message || 'Could not initialise 3D preview'
		}
	},
	beforeDestroy() {
		if (this.viewport) {
			this.viewport.dispose()
			this.viewport = null
		}
	},
	methods: {
		async reload() {
			if (!this.viewport || !this.jobId) {
				return
			}
			this.loading = true
			this.error = ''
			this.ready = false
			try {
				const tp = await fetchToolpath(this.jobId)
				this.tp = tp
				this.speedRange = tp.speedRange || null
				// If the sidecar didn't emit speeds, force feature mode.
				if (!this.speedRange) {
					this.colorMode = 'feature'
				}
				this.viewport.disposeToolpath?.()
				this.viewport.showToolpath?.(tp, FEATURE_COLORS, this.colorMode)
				this.layerCount = tp.layerCount || tp.layers.length
				this.currentLayer = this.layerCount - 1
				this.minLayer = 0
				this.features = presentFeatures(tp)
				const vis = {}
				// Travel + retractions are noisy — hidden by default; seams stay on
				// (they're the useful marker). Everything else is visible.
				const HIDDEN_BY_DEFAULT = new Set(['travel', 'retraction'])
				for (const f of this.features) {
					vis[f] = !HIDDEN_BY_DEFAULT.has(f)
				}
				this.visible = vis
				this._recomputeTopLayerMoves()
				this.currentMove = this.topLayerMoves
				this._applyLayerView()
				this.ready = true
			} catch (e) {
				this.error = e?.message || 'Toolpath preview unavailable'
			} finally {
				this.loading = false
			}
		},
		onLayer(val) {
			this.currentLayer = Number(val)
			// Keep the band valid: the bottom can't rise above the top.
			if (this.minLayer > this.currentLayer) {
				this.minLayer = this.currentLayer
			}
			this._recomputeTopLayerMoves()
			this.currentMove = this.topLayerMoves
			this._applyLayerView()
		},
		onMinLayer(val) {
			this.minLayer = Math.min(Number(val), this.currentLayer)
			this._applyLayerView()
		},
		onMove(val) {
			this.currentMove = Number(val)
			// The move scrubber is only meaningful with the full stack below (band off).
			this.viewport?.setToolpathMoveRange?.(this.currentLayer, this.currentMove)
		},
		// Apply the current layer view: a min–max band when the bottom is raised,
		// otherwise the single-cap path (which the move scrubber piggybacks on).
		_applyLayerView() {
			if (this.minLayer > 0) {
				this.viewport?.setToolpathLayerRangeMinMax?.(this.minLayer, this.currentLayer)
			} else {
				this.viewport?.setToolpathLayerRange?.(this.currentLayer)
				this.viewport?.setToolpathMoveRange?.(this.currentLayer, this.currentMove)
			}
		},
		setColorMode(mode) {
			if (mode === this.colorMode || (mode === 'speed' && !this.speedRange)) {
				return
			}
			this.colorMode = mode
			if (this.tp && this.viewport) {
				// Rebuild the lines with the new color scheme, preserving the layer view.
				this.viewport.showToolpath?.(this.tp, FEATURE_COLORS, this.colorMode)
				for (const f of this.features) {
					this.viewport.setToolpathFeatureVisible?.(f, this.visible[f])
				}
				this._applyLayerView()
			}
		},
		// The move slider caps the segment count in the current TOP layer.
		_recomputeTopLayerMoves() {
			const layer = this.tp?.layers?.[this.currentLayer]
			let segs = 0
			if (layer) {
				for (const arr of Object.values(layer.features || {})) {
					segs += (arr.length / 3) / 2 // 2 verts/segment
				}
			}
			this.topLayerMoves = Math.max(0, Math.round(segs))
		},
		speedLegendStops() {
			if (!this.speedRange) {
				return []
			}
			const { min, max } = this.speedRange
			return [0, 0.5, 1].map((t) => {
				const v = min + (max - min) * t
				const [r, g, b] = colorForSpeed(v, min, max)
				return { color: `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`, label: `${Math.round(v)}` }
			})
		},
		toggleFeature(feat) {
			this.visible = { ...this.visible, [feat]: !this.visible[feat] }
			this.viewport?.setToolpathFeatureVisible?.(feat, this.visible[feat])
		},
		swatch(feat) {
			const hex = (FEATURE_COLORS[feat] ?? 0x8b949e).toString(16).padStart(6, '0')
			return `#${hex}`
		},
		labelFor(feat) {
			return FEATURE_LABELS[feat] || feat
		},
	},
}
</script>

<style scoped lang="scss">
.tp3d {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-height: 360px;
}
.tp3d__viewport {
	position: relative;
	flex: 1 1 auto;
	min-height: 320px;
	border-radius: 8px;
	overflow: hidden;
	background: #161b22;
}
.tp3d__canvas {
	width: 100%;
	height: 100%;
	display: block;
}
.tp3d__status {
	padding: 6px 10px;
	font-size: 0.85rem;
	color: var(--color-text-maxcontrast, #8b949e);
	&--error {
		color: var(--color-error, #e5534b);
	}
}
.tp3d__controls {
	display: flex;
	flex-direction: column;
	gap: 8px;
}
.tp3d__layerrow {
	display: flex;
	align-items: center;
	gap: 10px;
}
.tp3d__label {
	font-size: 0.8rem;
	color: var(--color-text-maxcontrast, #8b949e);
}
.tp3d__slider {
	flex: 1 1 auto;
}
.tp3d__layernum {
	font-variant-numeric: tabular-nums;
	font-size: 0.8rem;
	min-width: 68px;
	text-align: right;
}
.tp3d__colorrow {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 6px;
}
.tp3d__modebtn {
	appearance: none;
	background: var(--color-background-hover, #21262d);
	border: 1px solid var(--color-border, #30363d);
	border-radius: 999px;
	color: inherit;
	cursor: pointer;
	font-size: 0.78rem;
	padding: 3px 10px;
}
.tp3d__modebtn--on {
	background: color-mix(in srgb, var(--nc-app-accent, #22c55e) 22%, transparent);
	border-color: var(--nc-app-accent, #22c55e);
}
.tp3d__modebtn:disabled {
	cursor: default;
	opacity: 0.4;
}
.tp3d__gradient {
	display: inline-flex;
	align-items: stretch;
	border-radius: 4px;
	overflow: hidden;
	height: 16px;
	margin-left: 4px;
}
.tp3d__gradstop {
	display: inline-flex;
	align-items: center;
	color: #000;
	font-size: 9px;
	font-weight: 700;
	padding: 0 6px;
}
.tp3d__gradunit {
	align-self: center;
	font-size: 9px;
	margin-left: 4px;
	opacity: 0.7;
}
.tp3d__legend {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}
.tp3d__chip {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 3px 8px;
	border-radius: 999px;
	border: 1px solid var(--color-border, #30363d);
	background: var(--color-background-hover, #21262d);
	font-size: 0.78rem;
	cursor: pointer;
	&--off {
		opacity: 0.4;
	}
}
.tp3d__swatch {
	width: 10px;
	height: 10px;
	border-radius: 2px;
	display: inline-block;
}

/* ── Immersive: viewport fills the parent; controls float as a bottom bar. ──── */
.tp3d--immersive {
	position: absolute;
	inset: 0;
	min-height: 0;
	gap: 0;
}
.tp3d--immersive .tp3d__viewport {
	border-radius: 0;
	min-height: 0;
}
.tp3d--immersive .tp3d__status {
	position: absolute;
	top: 12px;
	left: 50%;
	transform: translateX(-50%);
	z-index: 7;
	border-radius: 999px;
	background: color-mix(in srgb, var(--nc-gcs-bg-surface, #161b22) 82%, transparent);
	backdrop-filter: blur(8px);
}
.tp3d--immersive .tp3d__controls {
	position: absolute;
	bottom: 16px;
	left: 50%;
	transform: translateX(-50%);
	z-index: 7;
	width: max-content;
	max-width: min(720px, calc(100% - 680px)); /* clear of the 300px side cards + margins */
	padding: 10px 14px;
	border: 1px solid var(--nc-gcs-border, #30363d);
	border-radius: var(--nc-gcs-radius-md, 12px);
	background: color-mix(in srgb, var(--nc-gcs-bg-surface, #161b22) 82%, transparent);
	backdrop-filter: blur(8px);
	box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
}
.tp3d--immersive .tp3d__slider {
	min-width: 260px;
}
/* On narrow screens the Slice layout goes static; the bar spans normally. */
@media (max-width: 1200px) {
	.tp3d--immersive {
		position: relative;
		inset: auto;
		min-height: 360px;
	}
	.tp3d--immersive .tp3d__controls {
		position: static;
		transform: none;
		max-width: none;
		width: auto;
	}
}
</style>
