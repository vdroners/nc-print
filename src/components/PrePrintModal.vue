<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { activateFocusTrap } from '@/composables/useFocusTrap.js'
import { useCameraFrame } from '@/composables/useCameraFrame.js'
import { cameraStreamUrl } from '@/services/moonraker-api.js'
import TargetPrinterPicker from './TargetPrinterPicker.vue'

export default {
	name: 'PrePrintModal',
	components: { TargetPrinterPicker },
	mixins: [useCameraFrame('streamUrl')],
	data() {
		return {
			focusTrap: null,
		}
	},
	computed: {
		...mapStores(usePrintStore),
		visible() {
			return this.printStore.prePrintModal.visible
		},
		streamUrl() {
			if (!this.printStore.prePrintModal.visible) {
				return ''
			}
			return cameraStreamUrl(this.printStore.config, this.printStore.selectedPrinterId)
		},
		cameraPlaceholderText() {
			if (!this.streamUrl) {
				return 'No camera configured'
			}
			if (this.cameraError) {
				return this.cameraErrorMessage || 'Camera unavailable'
			}
			return 'Loading camera…'
		},
		checklist() {
			const rows = [
				{
					id: 'model',
					label: 'Model loaded and slice-ready',
					ok: this.printStore.prepareChecklist.find(r => r.id === 'mesh')?.ok
						&& this.printStore.prepareChecklist.find(r => r.id === 'model')?.ok
						&& this.printStore.prepareChecklist.find(r => r.id === 'preview')?.ok,
				},
				{
					id: 'profiles',
					label: 'Slicer profile, filament, and process selected',
					ok: this.printStore.profilesReady,
				},
				{
					id: 'target',
					label: 'Send-to printer selected',
					ok: !!this.printStore.selectedPrinterId,
				},
				{
					id: 'slicer',
					label: 'Slicer service online',
					ok: this.printStore.slicerReady,
				},
				{
					id: 'printer',
					label: 'Printer reachable',
					ok: this.printStore.printerState.connected,
					warn: !this.printStore.printerState.connected,
					// Wave C: an offline printer only blocks Start — the G-code
					// upload attempt is still allowed (it fails with a clear toast
					// if Moonraker is truly unreachable).
					startOnly: true,
				},
				{
					id: 'bed',
					label: 'Bed is clear and printer is ready to start',
					ok: true,
					manual: true,
				},
			]
			return rows
		},
		blockers() {
			return this.checklist.filter(r => !r.ok && !r.manual && !r.startOnly)
		},
		canUpload() {
			return this.blockers.length === 0
		},
		canStart() {
			return this.canUpload && this.printStore.printerState.connected
		},
	},
	watch: {
		visible(val) {
			if (val) {
				this.$nextTick(() => {
					const el = this.$refs.dialog
					if (el) {
						this.focusTrap?.deactivate()
						this.focusTrap = activateFocusTrap(el)
					}
				})
				document.addEventListener('keydown', this.onKeydown)
			} else {
				document.removeEventListener('keydown', this.onKeydown)
				this.focusTrap?.deactivate()
				this.focusTrap = null
			}
		},
	},
	beforeDestroy() {
		document.removeEventListener('keydown', this.onKeydown)
		this.focusTrap?.deactivate()
	},
	methods: {
		cancel() {
			this.printStore.cancelPrePrint()
		},
		confirmStart() {
			if (!this.canStart) {
				return
			}
			this.printStore.confirmPrePrint('start')
		},
		confirmUpload() {
			if (!this.canUpload) {
				return
			}
			this.printStore.confirmPrePrint('upload')
		},
		onBackdrop(e) {
			if (e.target === e.currentTarget) {
				this.cancel()
			}
		},
		onKeydown(e) {
			if (e.key === 'Escape') {
				this.cancel()
			}
		},
	},
}
</script>

<template>
	<teleport to="body">
		<div
			v-if="visible"
			class="nc-print-modal-backdrop"
			role="presentation"
			@click="onBackdrop">
			<div
				ref="dialog"
				class="nc-print-modal nc-print-preprint-modal"
				role="dialog"
				aria-modal="true"
				aria-labelledby="nc-print-preprint-title">
				<h2 id="nc-print-preprint-title" class="nc-print-modal__title">
					Ready to slice and send?
				</h2>
				<p class="nc-print-preprint-modal__lead">
					Confirm the checklist below, then upload the G-code — with or without
					starting the print.
				</p>
				<TargetPrinterPicker variant="modal" :show-scan="false" select-id="nc-print-target-printer-modal" />
				<div class="nc-print-preprint-modal__camera nc-print-camera-panel">
					<img
						v-if="cameraFrameUrl && !cameraError"
						:src="cameraFrameUrl"
						alt="Printer chamber preview"
						loading="lazy"
						@error="onCameraError">
					<div v-else class="nc-print-camera-placeholder">
						<p>{{ cameraPlaceholderText }}</p>
						<button v-if="cameraError" type="button" class="nc-print-btn nc-print-btn--small" @click="retryCamera">
							Retry
						</button>
					</div>
				</div>
				<ul class="nc-print-preprint-modal__list">
					<li
						v-for="row in checklist"
						:key="row.id"
						:class="{
							'nc-print-preprint-modal__item--ok': row.ok && !row.manual,
							'nc-print-preprint-modal__item--warn': row.warn,
							'nc-print-preprint-modal__item--manual': row.manual,
						}">
						<span class="nc-print-preprint-modal__icon" aria-hidden="true">
							{{ row.manual ? '☐' : (row.ok ? '✓' : '✗') }}
						</span>
						{{ row.label }}
					</li>
				</ul>
				<p v-if="!canUpload" class="nc-print-preprint-modal__blocker">
					Fix the failed items before continuing.
				</p>
				<p v-else-if="!canStart" class="nc-print-preprint-modal__blocker nc-print-preprint-modal__blocker--warn">
					Printer offline — you can still slice and upload; starting the print
					needs a reachable printer.
				</p>
				<div class="nc-print-modal__actions">
					<button type="button" class="nc-print-btn" @click="cancel">
						Cancel
					</button>
					<button
						type="button"
						class="nc-print-btn"
						:disabled="!canUpload"
						title="Slice and upload the G-code without starting the print"
						@click="confirmUpload">
						Upload only
					</button>
					<button
						type="button"
						class="nc-print-btn nc-print-btn--primary"
						:disabled="!canStart"
						:title="canStart ? 'Slice, upload, and start printing' : 'Printer must be reachable to start'"
						@click="confirmStart">
						Slice, send &amp; start
					</button>
				</div>
			</div>
		</div>
	</teleport>
</template>

<style scoped>
.nc-print-modal-backdrop {
	align-items: center;
	background: rgba(0, 0, 0, 0.55);
	display: flex;
	inset: 0;
	justify-content: center;
	padding: var(--nc-gcs-space-lg);
	position: fixed;
	z-index: 9999;
}

.nc-print-modal {
	background: var(--nc-gcs-bg-surface);
	border: 1px solid var(--nc-gcs-border);
	border-radius: var(--nc-gcs-radius);
	max-width: 440px;
	padding: var(--nc-gcs-space-lg);
	width: 100%;
}

.nc-print-modal__title {
	font-size: var(--nc-gcs-text-lg, 1.125rem);
	font-weight: 600;
	margin: 0 0 var(--nc-gcs-space-sm);
}

.nc-print-modal__actions {
	display: flex;
	gap: var(--nc-gcs-space-sm);
	justify-content: flex-end;
	margin-top: var(--nc-gcs-space-md);
}

.nc-print-preprint-modal__lead {
	color: var(--nc-gcs-text-secondary);
	font-size: var(--nc-gcs-text-sm);
	margin: 0 0 var(--nc-gcs-space-md);
}

.nc-print-preprint-modal__camera {
	margin: 0 0 var(--nc-gcs-space-md);
	max-width: 260px;
}

.nc-print-preprint-modal__camera .nc-print-camera-placeholder {
	flex-direction: column;
	gap: 6px;
	min-height: 120px;
	padding: var(--nc-gcs-space-sm);
	text-align: center;
}

.nc-print-preprint-modal__camera .nc-print-camera-placeholder p {
	margin: 0;
}

.nc-print-preprint-modal__list {
	list-style: none;
	margin: 0;
	padding: 0;
}

.nc-print-preprint-modal__list li {
	align-items: flex-start;
	display: flex;
	font-size: var(--nc-gcs-text-sm);
	gap: 8px;
	margin-bottom: 8px;
}

.nc-print-preprint-modal__item--ok {
	color: var(--nc-app-accent);
}

.nc-print-preprint-modal__item--warn {
	color: var(--nc-gcs-warning, #eab308);
}

.nc-print-preprint-modal__item--manual {
	color: var(--nc-gcs-text-secondary);
}

.nc-print-preprint-modal__blocker {
	color: var(--nc-gcs-danger-soft);
	font-size: var(--nc-gcs-text-sm);
	margin: var(--nc-gcs-space-sm) 0 0;
}

.nc-print-preprint-modal__blocker--warn {
	color: var(--nc-gcs-warning, #eab308);
}
</style>
