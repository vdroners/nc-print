<template>
	<div class="tp3d">
		<div v-if="loading" class="tp3d__status">Loading toolpath…</div>
		<div v-else-if="error" class="tp3d__status tp3d__status--error">{{ error }}</div>

		<div class="tp3d__viewport" ref="wrap">
			<canvas ref="canvas" class="tp3d__canvas" />
		</div>

		<div v-if="ready" class="tp3d__controls">
			<div class="tp3d__layerrow">
				<label class="tp3d__label" :for="sliderId">Layer</label>
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
			<div class="tp3d__legend">
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
	FEATURE_COLORS,
	FEATURE_LABELS,
} from '@/services/toolpath-3d.js'

let _uid = 0

export default {
	name: 'Toolpath3D',
	props: {
		jobId: { type: String, default: '' },
		buildVolume: { type: Array, default: () => [220, 220, 220] },
	},
	data() {
		return {
			viewport: null,
			loading: false,
			error: '',
			ready: false,
			layerCount: 0,
			currentLayer: 0,
			features: [],
			visible: {},
			sliderId: `tp3d-layer-${++_uid}`,
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
				this.viewport.disposeToolpath?.()
				this.viewport.showToolpath?.(tp, FEATURE_COLORS)
				this.layerCount = tp.layerCount || tp.layers.length
				this.currentLayer = this.layerCount - 1
				this.features = presentFeatures(tp)
				const vis = {}
				for (const f of this.features) {
					vis[f] = f !== 'travel'
				}
				this.visible = vis
				this.viewport.setToolpathLayerRange?.(this.currentLayer)
				this.ready = true
			} catch (e) {
				this.error = e?.message || 'Toolpath preview unavailable'
			} finally {
				this.loading = false
			}
		},
		onLayer(val) {
			this.currentLayer = Number(val)
			this.viewport?.setToolpathLayerRange?.(this.currentLayer)
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
</style>
