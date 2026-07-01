<script>
import { mapStores } from 'pinia'
import { usePrintStore, TABS } from '@/store/print.js'
import { pausePrint, resumePrint, cancelPrint, uploadAndStart } from '@/services/moonraker-api.js'
import { cameraStreamUrl } from '@/services/moonraker-api.js'
import { useCameraFrame } from '@/composables/useCameraFrame.js'
import { pickFileFromNextcloud } from '@/composables/useNextcloudFilePicker.js'
import { toastError, toastSuccess } from '@/services/toast.js'

export default {
	name: 'PrintTab',
	mixins: [useCameraFrame('streamUrl')],
	data() {
		return {
			busy: false,
			uploadBusy: false,
			startAfterUpload: true,
		}
	},
	computed: {
		...mapStores(usePrintStore),
		streamUrl() {
			return cameraStreamUrl(this.printStore.config)
		},
		controls() {
			return this.printStore.printerControls
		},
		showIdleGuide() {
			return !this.controls.isActive && !this.printStore.printerState.filename
		},
		elapsedLabel() {
			const d = this.printStore.printerState.printDuration
			if (d == null || Number.isNaN(d)) {
				return null
			}
			const mins = Math.floor(d / 60)
			const secs = Math.floor(d % 60)
			return `${mins}m ${secs}s elapsed`
		},
	},
	mounted() {
		void this.consumePendingPrintUpload()
	},
	watch: {
		'printStore.pendingPrintUpload'() {
			void this.consumePendingPrintUpload()
		},
	},
	methods: {
		async consumePendingPrintUpload() {
			const pending = this.printStore.pendingPrintUpload
			if (!pending?.blob) {
				return
			}
			this.printStore.clearPendingPrintUpload()
			await this.uploadGcodeFile(new File([pending.blob], pending.filename, { type: 'text/plain' }))
		},
		goSlice() {
			this.printStore.setActiveTab(TABS.SLICE)
		},
		goPrepare() {
			this.printStore.setActiveTab(TABS.PREPARE)
		},
		async withBusy(fn) {
			this.busy = true
			try {
				await fn()
				await this.printStore.refreshPrinterState()
			} catch (e) {
				toastError('Print control failed', e)
			} finally {
				this.busy = false
			}
		},
		onPause() {
			return this.withBusy(() => pausePrint())
		},
		onResume() {
			return this.withBusy(() => resumePrint())
		},
		onCancel() {
			return this.withBusy(() => cancelPrint())
		},
		onGcodeInput(e) {
			const file = e.target.files?.[0]
			if (file) {
				void this.uploadGcodeFile(file)
			}
			e.target.value = ''
		},
		async uploadGcodeFile(file) {
			if (!file?.name?.toLowerCase().endsWith('.gcode')) {
				toastError('Select a .gcode file')
				return
			}
			this.uploadBusy = true
			try {
				await uploadAndStart(file, file.name, this.startAfterUpload)
				toastSuccess(this.startAfterUpload ? 'Print started' : 'G-code uploaded')
				await this.printStore.refreshPrinterState()
			} catch (e) {
				toastError('Upload failed', e)
			} finally {
				this.uploadBusy = false
			}
		},
		async pickGcodeFromFiles() {
			const file = await pickFileFromNextcloud({
				title: 'Select G-code',
				filter: node => /\.gcode$/i.test(node?.basename || node?.displayname || ''),
				canPick: node => /\.gcode$/i.test(node?.basename || node?.displayname || ''),
				allowGcode: true,
			})
			if (file) {
				await this.uploadGcodeFile(file)
			}
		},
	},
}
</script>

<template>
	<div class="nc-print-print-tab">
		<div v-if="showIdleGuide" class="nc-print-card nc-print-idle-guide">
			<h2 class="nc-print-card__title">No active print</h2>
			<p style="margin: 0 0 12px; color: var(--nc-gcs-text-secondary); font-size: var(--nc-gcs-text-sm);">
				Slice a model and send G-code from the <strong>Slice</strong> tab, or upload G-code below.
			</p>
			<div class="nc-print-actions">
				<button type="button" class="nc-print-btn nc-print-btn--primary" @click="goSlice">
					Go to Slice
				</button>
				<button type="button" class="nc-print-btn" @click="goPrepare">
					Go to Prepare
				</button>
			</div>
		</div>

		<div v-if="!showIdleGuide" class="nc-print-card">
			<h2 class="nc-print-card__title">Print control</h2>
			<p style="font-size: var(--nc-gcs-text-sm); color: var(--nc-gcs-text-muted); margin: 0 0 8px;">
				State: <strong>{{ printStore.printerStatusLabel }}</strong>
				<span v-if="printStore.printerState.progress">
					· {{ Math.round(printStore.printerState.progress * 100) }}%
				</span>
			</p>
			<p v-if="printStore.printerState.filename" style="font-size: var(--nc-gcs-text-sm); margin: 0 0 8px;">
				File: <strong>{{ printStore.printerState.filename }}</strong>
			</p>
			<p v-if="printStore.printerState.message" style="font-size: var(--nc-gcs-text-sm); margin: 0 0 8px;">
				{{ printStore.printerState.message }}
			</p>
			<p v-if="elapsedLabel" style="font-size: var(--nc-gcs-text-sm); margin: 0 0 8px;">
				{{ elapsedLabel }}
			</p>
			<p style="font-size: var(--nc-gcs-text-sm); color: var(--nc-gcs-text-muted); margin: 0 0 12px;">
				<span v-if="printStore.printerState.extruderTemp != null">
					Nozzle {{ Math.round(printStore.printerState.extruderTemp) }}°C
				</span>
				<span v-if="printStore.printerState.bedTemp != null">
					· Bed {{ Math.round(printStore.printerState.bedTemp) }}°C
				</span>
			</p>

			<div v-if="controls.isActive" class="nc-print-progress">
				<div
					class="nc-print-progress__bar"
					:style="{ width: (printStore.printerState.progress * 100) + '%' }" />
			</div>

			<div class="nc-print-actions">
				<button
					type="button"
					class="nc-print-btn"
					:disabled="busy || !controls.canPause"
					@click="onPause">
					Pause
				</button>
				<button
					type="button"
					class="nc-print-btn nc-print-btn--primary"
					:disabled="busy || !controls.canResume"
					@click="onResume">
					Resume
				</button>
				<button
					type="button"
					class="nc-print-btn nc-print-btn--danger"
					:disabled="busy || !controls.canCancel"
					@click="onCancel">
					Cancel
				</button>
			</div>
		</div>

		<div class="nc-print-card">
			<h2 class="nc-print-card__title">Send G-code</h2>
			<label style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; font-size: var(--nc-gcs-text-sm);">
				<input v-model="startAfterUpload" type="checkbox">
				Start print after upload
			</label>
			<div class="nc-print-actions">
				<label class="nc-print-btn">
					Upload local file
					<input type="file" accept=".gcode" hidden @change="onGcodeInput">
				</label>
				<button
					type="button"
					class="nc-print-btn"
					:disabled="uploadBusy"
					@click="pickGcodeFromFiles">
					From Files
				</button>
			</div>
		</div>

		<div class="nc-print-card">
			<h2 class="nc-print-card__title">Camera</h2>
			<div class="nc-print-camera-panel">
				<img
					v-if="cameraFrameUrl && !cameraError"
					:src="cameraFrameUrl"
					alt="Printer camera stream"
					@error="onCameraError">
				<div v-else class="nc-print-camera-placeholder">
					{{ streamUrl ? 'Camera unavailable' : 'No camera URL configured — set webcam URL in NC Print settings.' }}
				</div>
			</div>
		</div>
	</div>
</template>
