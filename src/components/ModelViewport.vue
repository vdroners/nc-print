<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { createViewport } from '@/three/viewport.js'

export default {
	name: 'ModelViewport',
	props: {
		file: { type: [File, Blob], default: null },
		buildVolume: {
			type: Array,
			default: () => [220, 220, 220],
		},
	},
	data() {
		return {
			dragOver: false,
			viewport: null,
			hasMesh: false,
			loading: false,
		}
	},
	computed: {
		...mapStores(usePrintStore),
	},
	watch: {
		file: {
			immediate: true,
			handler(f) {
				void this.loadFile(f)
			},
		},
		buildVolume: {
			deep: true,
			handler(vol) {
				this.viewport?.setBedVolume(vol)
			},
		},
	},
	async mounted() {
		const wrap = this.$refs.wrap
		const canvas = this.$refs.canvas
		if (!wrap || !canvas) {
			return
		}
		this.viewport = await createViewport(canvas, wrap)
		this.viewport.setBedVolume(this.buildVolume)
		if (this.file) {
			await this.loadFile(this.file)
		}
	},
	beforeDestroy() {
		this.viewport?.dispose()
	},
	methods: {
		async loadFile(file) {
			if (!this.viewport || !file) {
				this.hasMesh = false
				return
			}
			this.loading = true
			try {
				const meta = await this.viewport.loadModel(file)
				this.hasMesh = !!meta && !meta.previewSkipped
				this.printStore.setModelMeta(meta)
			} catch (e) {
				console.warn('[nc_print] viewport load failed:', e?.message || e)
			} finally {
				this.loading = false
			}
		},
		recenter() {
			this.viewport?.recenter()
		},
		onDrop(e) {
			e.preventDefault()
			this.dragOver = false
			const file = e.dataTransfer?.files?.[0]
			if (file && this.printStore.setModel(file, 'drop')) {
				this.$emit('file', file)
			}
		},
		onDragOver(e) {
			e.preventDefault()
			this.dragOver = true
		},
		onDragLeave() {
			this.dragOver = false
		},
	},
}
</script>

<template>
	<div
		ref="wrap"
		class="nc-print-viewport-inner"
		:class="{ 'nc-print-viewport-inner--drag': dragOver }"
		@drop="onDrop"
		@dragover="onDragOver"
		@dragleave="onDragLeave">
		<canvas ref="canvas" aria-label="3D model viewport" />
		<div v-if="!file && !loading" class="nc-print-viewport-empty">
			<div class="nc-print-viewport-empty__icon" aria-hidden="true">📐</div>
			Drop or import a model file<br>
			<small>STL · 3MF · OBJ</small>
		</div>
		<div v-if="file && !hasMesh && !loading" class="nc-print-viewport-empty nc-print-viewport-empty--hint">
			Preview STL only; other formats still slice on the server.
		</div>
		<div
			v-if="printStore.modelMeta.bbox && !printStore.modelMeta.fitsBed"
			class="nc-print-viewport-warn">
			Model may exceed build volume
		</div>
		<div v-if="printStore.modelMeta.bbox" class="nc-print-viewport-meta">
			{{ Math.round(printStore.modelMeta.bbox.x) }}×{{ Math.round(printStore.modelMeta.bbox.y) }}×{{ Math.round(printStore.modelMeta.bbox.z) }} mm
			<span v-if="printStore.modelMeta.triangleCount"> · {{ printStore.modelMeta.triangleCount }} tris</span>
		</div>
	</div>
</template>

<style scoped>
.nc-print-viewport-inner {
	min-height: 360px;
	position: relative;
}

.nc-print-viewport-inner--drag {
	outline: 2px solid var(--nc-app-accent);
}

.nc-print-viewport-empty {
	color: var(--nc-gcs-text-muted);
	font-size: var(--nc-gcs-text-sm);
	left: 50%;
	position: absolute;
	text-align: center;
	top: 50%;
	transform: translate(-50%, -50%);
	z-index: 1;
	pointer-events: none;
}

.nc-print-viewport-empty__icon {
	font-size: 2rem;
	margin-bottom: 4px;
}

.nc-print-viewport-empty--hint {
	font-size: 12px;
	top: 70%;
}

.nc-print-viewport-warn {
	background: color-mix(in srgb, var(--nc-gcs-danger) 25%, transparent);
	border-radius: var(--nc-gcs-radius-sm);
	color: var(--nc-gcs-danger-soft);
	font-size: var(--nc-gcs-text-sm);
	left: 8px;
	padding: 4px 8px;
	position: absolute;
	top: 8px;
	z-index: 2;
}

.nc-print-viewport-meta {
	background: rgba(0, 0, 0, 0.45);
	border-radius: var(--nc-gcs-radius-sm);
	bottom: 8px;
	color: #e6edf3;
	font-size: 11px;
	left: 8px;
	padding: 4px 8px;
	position: absolute;
	z-index: 2;
}
</style>
