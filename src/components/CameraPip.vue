<script>
import { cameraStreamUrl } from '@/services/moonraker-api.js'
import { useCameraFrame } from '@/composables/useCameraFrame.js'

const PIP_POS_KEY = 'nc_print_camera_pip_pos'

export default {
	name: 'CameraPip',
	mixins: [useCameraFrame('streamUrl')],
	props: {
		config: { type: Object, default: null },
		printerId: { type: String, default: '' },
		draggable: { type: Boolean, default: false },
	},
	data() {
		return {
			dragging: false,
			pos: { x: null, y: null },
			dragStart: null,
		}
	},
	computed: {
		streamUrl() {
			return cameraStreamUrl(this.config, this.printerId)
		},
		showPlaceholder() {
			return !this.streamUrl || this.cameraError || !this.cameraFrameUrl
		},
		placeholderText() {
			if (!this.streamUrl) {
				return 'No camera URL configured'
			}
			if (this.cameraError) {
				return this.cameraErrorMessage || 'Camera unavailable'
			}
			return 'Loading camera…'
		},
		pipStyle() {
			if (this.pos.x == null || this.pos.y == null) {
				return {}
			}
			return {
				left: `${this.pos.x}px`,
				top: `${this.pos.y}px`,
				right: 'auto',
				bottom: 'auto',
			}
		},
	},
	mounted() {
		this.restorePosition()
	},
	methods: {
		restorePosition() {
			try {
				const raw = localStorage.getItem(PIP_POS_KEY)
				if (raw) {
					const parsed = JSON.parse(raw)
					if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
						this.pos = parsed
					}
				}
			} catch {
				// ignore
			}
		},
		savePosition() {
			if (this.pos.x == null || this.pos.y == null) {
				return
			}
			try {
				localStorage.setItem(PIP_POS_KEY, JSON.stringify(this.pos))
			} catch {
				// ignore
			}
		},
		onPointerDown(e) {
			if (!this.draggable) {
				return
			}
			e.preventDefault()
			const el = this.$refs.pip
			const parent = el?.offsetParent || el?.parentElement
			if (!el || !parent) {
				return
			}
			const rect = el.getBoundingClientRect()
			const parentRect = parent.getBoundingClientRect()
			if (this.pos.x == null) {
				this.pos = {
					x: rect.left - parentRect.left,
					y: rect.top - parentRect.top,
				}
			}
			this.dragging = true
			this.dragStart = {
				px: e.clientX,
				py: e.clientY,
				ox: this.pos.x,
				oy: this.pos.y,
			}
			window.addEventListener('pointermove', this.onPointerMove)
			window.addEventListener('pointerup', this.onPointerUp)
		},
		onPointerMove(e) {
			if (!this.dragging || !this.dragStart) {
				return
			}
			this.pos = {
				x: Math.max(0, this.dragStart.ox + (e.clientX - this.dragStart.px)),
				y: Math.max(0, this.dragStart.oy + (e.clientY - this.dragStart.py)),
			}
		},
		onPointerUp() {
			this.dragging = false
			this.dragStart = null
			this.savePosition()
			window.removeEventListener('pointermove', this.onPointerMove)
			window.removeEventListener('pointerup', this.onPointerUp)
		},
	},
	beforeDestroy() {
		window.removeEventListener('pointermove', this.onPointerMove)
		window.removeEventListener('pointerup', this.onPointerUp)
	},
}
</script>

<template>
	<div
		v-if="streamUrl"
		ref="pip"
		class="nc-print-camera-pip"
		:class="{ 'nc-print-camera-pip--draggable': draggable, 'nc-print-camera-pip--dragging': dragging }"
		:style="pipStyle"
		@pointerdown="onPointerDown">
		<span v-if="draggable" class="nc-print-camera-pip__handle" aria-hidden="true">⋮⋮</span>
		<img
			v-if="cameraFrameUrl && !cameraError"
			:src="cameraFrameUrl"
			alt="Printer camera"
			loading="lazy"
			draggable="false"
			@error="onCameraError">
		<div v-else class="nc-print-camera-pip__placeholder">
			<p>{{ placeholderText }}</p>
			<button v-if="cameraError" type="button" class="nc-print-btn" @click="retryCamera">
				Retry
			</button>
		</div>
	</div>
</template>

<style scoped>
.nc-print-camera-pip--draggable {
	cursor: grab;
	touch-action: none;
	user-select: none;
}

.nc-print-camera-pip--dragging {
	cursor: grabbing;
	z-index: 4;
}

.nc-print-camera-pip__handle {
	background: rgba(0, 0, 0, 0.45);
	border-radius: 4px 4px 0 0;
	color: #fff;
	display: block;
	font-size: 10px;
	letter-spacing: 2px;
	line-height: 1;
	padding: 3px 6px;
	text-align: center;
}

.nc-print-camera-pip__placeholder {
	align-items: center;
	background: var(--nc-gcs-bg-elevated);
	color: var(--nc-gcs-text-muted);
	display: flex;
	flex-direction: column;
	font-size: 11px;
	gap: 6px;
	justify-content: center;
	min-height: 90px;
	padding: 8px;
	text-align: center;
}

.nc-print-camera-pip__placeholder p {
	margin: 0;
}
</style>
