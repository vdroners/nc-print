<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { classifyDrop, ACCEPTED_LABEL } from '@/utils/drop-accept.js'
import { toastWarning } from '@/services/toast.js'
import { TABS } from '@/constants/tabs.js'
import NcPrintIcon from './NcPrintIcon.vue'

/**
 * Full-screen drag-drop upload overlay (3DPrintForge parity). Drag an OS file
 * anywhere over the window → a big drop target appears; drop a model to load it
 * into Prepare, or g-code to queue it for the Print tab. Internal element drags
 * (dragging UI bits) never trigger it — we only react when the drag carries
 * files (`dataTransfer.types` includes "Files").
 */
export default {
	name: 'DropZoneOverlay',
	components: { NcPrintIcon },
	data() {
		return {
			active: false,
			depth: 0, // dragenter/dragleave balance (they fire per child element)
			acceptedLabel: ACCEPTED_LABEL,
		}
	},
	computed: {
		...mapStores(usePrintStore),
	},
	mounted() {
		window.addEventListener('dragenter', this.onDragEnter)
		window.addEventListener('dragover', this.onDragOver)
		window.addEventListener('dragleave', this.onDragLeave)
		window.addEventListener('drop', this.onDrop)
	},
	beforeDestroy() {
		window.removeEventListener('dragenter', this.onDragEnter)
		window.removeEventListener('dragover', this.onDragOver)
		window.removeEventListener('dragleave', this.onDragLeave)
		window.removeEventListener('drop', this.onDrop)
	},
	methods: {
		hasFiles(e) {
			const types = e.dataTransfer?.types
			return !!types && Array.prototype.indexOf.call(types, 'Files') !== -1
		},
		onDragEnter(e) {
			if (!this.hasFiles(e)) {
				return
			}
			e.preventDefault()
			this.depth++
			this.active = true
		},
		onDragOver(e) {
			if (!this.hasFiles(e)) {
				return
			}
			// Needed so the browser fires a drop event instead of navigating.
			e.preventDefault()
			if (e.dataTransfer) {
				e.dataTransfer.dropEffect = 'copy'
			}
		},
		onDragLeave(e) {
			if (!this.active) {
				return
			}
			this.depth = Math.max(0, this.depth - 1)
			if (this.depth === 0) {
				this.active = false
			}
		},
		onDrop(e) {
			this.depth = 0
			if (!this.active && !this.hasFiles(e)) {
				return
			}
			this.active = false
			if (!this.hasFiles(e)) {
				return
			}
			e.preventDefault()
			const file = e.dataTransfer?.files?.[0]
			if (!file) {
				return
			}
			this.handleFile(file)
		},
		handleFile(file) {
			switch (classifyDrop(file.name)) {
			case 'model':
				this.printStore.setModel(file, 'drop')
				this.printStore.setActiveTab(TABS.PREPARE)
				break
			case 'gcode':
				this.printStore.queuePrintUpload(file, file.name)
				break
			default:
				toastWarning(`Unsupported file — drop ${this.acceptedLabel}`)
			}
		},
	},
}
</script>

<template>
	<teleport to="body">
		<div v-if="active" class="nc-print-dropzone" aria-hidden="true">
			<div class="nc-print-dropzone__card">
				<NcPrintIcon name="upload" :size="48" />
				<p class="nc-print-dropzone__title">Drop to load</p>
				<p class="nc-print-dropzone__sub">{{ acceptedLabel }}</p>
			</div>
		</div>
	</teleport>
</template>

<style scoped>
.nc-print-dropzone {
	align-items: center;
	background: rgba(0, 0, 0, 0.55);
	display: flex;
	inset: 0;
	justify-content: center;
	pointer-events: none;
	position: fixed;
	z-index: 4000;
}

.nc-print-dropzone__card {
	align-items: center;
	border: 3px dashed var(--nc-app-accent, var(--color-primary-element));
	border-radius: 20px;
	color: #fff;
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 48px 72px;
}

.nc-print-dropzone__title {
	font-size: 1.6rem;
	font-weight: 700;
	margin: 0;
}

.nc-print-dropzone__sub {
	color: rgba(255, 255, 255, 0.7);
	font-size: 0.9rem;
	letter-spacing: 0.05em;
	margin: 0;
}
</style>
