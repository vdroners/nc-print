<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { createViewport } from '@/three/viewport.js'
import { toastError } from '@/services/toast.js'
import { isModelFilename } from '@/shared/modelFileNode.js'

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
			viewportReady: false,
			viewportError: '',
			pendingFile: null,
			hasMesh: false,
			previewSkipped: false,
			loadError: '',
			loading: false,
		}
	},
	computed: {
		...mapStores(usePrintStore),
		isStlFile() {
			return isModelFilename(this.file?.name) && String(this.file?.name || '').toLowerCase().endsWith('.stl')
		},
		showEmptyDrop() {
			return !this.file && !this.loading && !this.viewportError
		},
		showLoading() {
			return this.loading && !!this.file
		},
		showPreviewSkipped() {
			return !!this.file && this.previewSkipped && !this.loading && !this.viewportError
		},
		showLoadError() {
			return !!this.file && !!this.loadError && !this.loading
		},
	},
	watch: {
		file: {
			immediate: true,
			handler(f) {
				this.queueLoad(f)
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
		try {
			this.viewport = await createViewport(canvas, wrap)
			this.viewport.setBedVolume(this.buildVolume)
			this.viewportReady = true
			this.viewportError = ''
			await this.flushPendingLoad()
		} catch (e) {
			this.viewportError = e?.message || 'WebGL viewport unavailable'
			toastError('3D preview failed to start', e)
		}
	},
	beforeDestroy() {
		this.viewport?.dispose()
	},
	methods: {
		queueLoad(file) {
			this.pendingFile = file || null
			this.loadError = ''
			this.previewSkipped = false
			if (!file) {
				this.hasMesh = false
				return
			}
			void this.flushPendingLoad()
		},
		async flushPendingLoad() {
			const file = this.pendingFile
			if (!file) {
				return
			}
			if (!this.viewportReady || !this.viewport) {
				return
			}
			this.loading = true
			this.loadError = ''
			this.previewSkipped = false
			this.hasMesh = false
			try {
				const meta = await this.viewport.loadModel(file)
				if (meta?.previewSkipped) {
					this.previewSkipped = true
					this.hasMesh = false
				} else {
					this.hasMesh = true
				}
				this.printStore.setModelMeta(meta)
			} catch (e) {
				this.loadError = e?.message || 'Could not load model preview'
				this.hasMesh = false
				if (this.isStlFile) {
					toastError('STL preview failed', e)
				}
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
		<div v-if="viewportError" class="nc-print-viewport-error" role="alert">
			{{ viewportError }}
		</div>
		<div v-if="showEmptyDrop" class="nc-print-viewport-empty">
			<div class="nc-print-viewport-empty__icon" aria-hidden="true">📐</div>
			Drop or import a model file<br>
			<small>STL · 3MF · OBJ</small>
		</div>
		<div v-if="showLoading" class="nc-print-viewport-empty">
			Loading preview…
		</div>
		<div v-if="showPreviewSkipped" class="nc-print-viewport-info">
			<strong>{{ file.name }}</strong> loaded — bed preview is STL-only; slicing still works on the server.
		</div>
		<div v-if="showLoadError" class="nc-print-viewport-error nc-print-viewport-error--inline">
			Preview failed: {{ loadError }}. You can still slice on the Slice tab.
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
	height: 360px;
	min-height: 360px;
	position: relative;
}

.nc-print-viewport-inner--drag {
	outline: 2px solid var(--nc-app-accent);
}

.nc-print-viewport-inner canvas {
	display: block;
	height: 100%;
	width: 100%;
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

.nc-print-viewport-info {
	background: color-mix(in srgb, var(--nc-app-accent) 18%, transparent);
	border: 1px solid color-mix(in srgb, var(--nc-app-accent) 40%, var(--nc-gcs-border));
	border-radius: var(--nc-gcs-radius-sm);
	bottom: 48px;
	color: var(--nc-gcs-text-secondary);
	font-size: var(--nc-gcs-text-sm);
	left: 8px;
	max-width: calc(100% - 16px);
	padding: 8px 10px;
	position: absolute;
	right: 8px;
	z-index: 2;
}

.nc-print-viewport-error {
	background: color-mix(in srgb, var(--nc-gcs-danger) 30%, transparent);
	border-radius: var(--nc-gcs-radius-sm);
	color: var(--nc-gcs-danger-soft);
	font-size: var(--nc-gcs-text-sm);
	left: 8px;
	padding: 8px 10px;
	position: absolute;
	right: 8px;
	top: 8px;
	z-index: 3;
}

.nc-print-viewport-error--inline {
	top: auto;
	bottom: 48px;
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
