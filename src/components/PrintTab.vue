<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { TABS } from '@/constants/tabs.js'
import { uploadAndStart } from '@/services/moonraker-api.js'
import { cameraStreamUrl } from '@/services/moonraker-api.js'
import { formatPrintTime } from '@/services/slicer-utils.js'
import { useCameraFrame } from '@/composables/useCameraFrame.js'
import { pickFileFromNextcloud } from '@/composables/useNextcloudFilePicker.js'
import { toastError, toastSuccess } from '@/services/toast.js'
import { loadPinned, togglePinned } from '@/utils/panel-prefs.js'
import WorkspaceRail from './WorkspaceRail.vue'
import PrintStatusBar from './PrintStatusBar.vue'
import PrintPanel from './PrintPanel.vue'
import MultiPrinterPicker from './MultiPrinterPicker.vue'
import TemperatureControl from './TemperatureControl.vue'
import InPrintTuningPanel from './InPrintTuningPanel.vue'
import ManualMotionPanel from './ManualMotionPanel.vue'
import EmergencyStopButton from './EmergencyStopButton.vue'
import PrintCompletionBanner from './PrintCompletionBanner.vue'
import NcPrintIcon from './NcPrintIcon.vue'
import ReopenMenu from './ReopenMenu.vue'
import JobHistoryPanel from './JobHistoryPanel.vue'
import TemperatureGraph from './TemperatureGraph.vue'
import HistoryPanel from './HistoryPanel.vue'
import PrintHistoryPanel from './PrintHistoryPanel.vue'
import GcodeThumbnail from './GcodeThumbnail.vue'
import GcodeConsole from './GcodeConsole.vue'
import BedMeshPanel from './BedMeshPanel.vue'
import QueuePanel from './QueuePanel.vue'
import FilamentPanel from './FilamentPanel.vue'
import TimelapsePanel from './TimelapsePanel.vue'
import PowerDevicePanel from './PowerDevicePanel.vue'
import WebcamListPanel from './WebcamListPanel.vue'
import SensorPanel from './SensorPanel.vue'
import UpdateStatusBanner from './UpdateStatusBanner.vue'
import UpdateControlPanel from './UpdateControlPanel.vue'
import AnnouncementsBanner from './AnnouncementsBanner.vue'

// Collapsible + pinnable Print panels, grouped into forge-style zones. Only
// panels with a cheap, store-derived visibility predicate are wrapped here (the
// `when` fn), so the wrapper header hides in lockstep with the panel's own
// self-gate and never shows empty. Data-dependent panels (Sensors, Filament,
// Timelapse, Queue, Webcams) already self-hide when empty and are rendered
// plainly below the zones — they don't wrap because their gate needs
// panel-internal fetched data the parent can't cheaply mirror.
//   when(store) -> boolean : mirrors the inner panel's outer v-if
const PANEL_ZONES = [
	{
		key: 'operate',
		label: 'Operate',
		panels: [
			{ id: 'tuning', title: 'In-print tuning', icon: 'bolt', comp: 'InPrintTuningPanel', open: true,
				when: (s) => s.printerControls.isActive },
			{ id: 'temperature', title: 'Temperature', icon: 'thermometer', comp: 'TemperatureControl', open: true,
				when: () => true },
			{ id: 'motion', title: 'Manual motion', icon: 'move', comp: 'ManualMotionPanel', open: false,
				when: (s) => s.printerState.connected && !s.printerControls.isActive },
			{ id: 'console', title: 'G-code console', icon: 'terminal', comp: 'GcodeConsole', open: false,
				when: (s) => s.consoleEnabled },
			{ id: 'power', title: 'Power devices', icon: 'bolt', comp: 'PowerDevicePanel', open: false,
				when: (s) => s.hasFeature('power') },
		],
	},
	{
		key: 'analyze',
		label: 'Analyze',
		panels: [
			{ id: 'tempgraph', title: 'Temperature graph', icon: 'thermometer', comp: 'TemperatureGraph', open: false,
				when: (s) => s.printerState.connected },
			{ id: 'bedmesh', title: 'Bed mesh', icon: 'grid', comp: 'BedMeshPanel', open: false,
				when: (s) => s.printerState.connected },
		],
	},
]

export default {
	name: 'PrintTab',
	components: {
		WorkspaceRail,
		PrintStatusBar,
		PrintPanel,
		MultiPrinterPicker,
		TemperatureControl,
		InPrintTuningPanel,
		ManualMotionPanel,
		EmergencyStopButton,
		PrintCompletionBanner,
		NcPrintIcon,
		ReopenMenu,
		JobHistoryPanel,
		TemperatureGraph,
		HistoryPanel,
		PrintHistoryPanel,
		GcodeThumbnail,
		GcodeConsole,
		BedMeshPanel,
		QueuePanel,
		FilamentPanel,
		TimelapsePanel,
		PowerDevicePanel,
		WebcamListPanel,
		SensorPanel,
		UpdateStatusBanner,
		UpdateControlPanel,
		AnnouncementsBanner,
	},
	mixins: [useCameraFrame('streamUrl')],
	data() {
		return {
			uploadBusy: false,
			startAfterUpload: true,
			cancelConfirmOpen: false,
			cameraFullscreen: false,
			pinned: loadPinned(),
		}
	},
	computed: {
		...mapStores(usePrintStore),
		printerId() {
			return this.printStore.selectedPrinterId || undefined
		},
		streamUrl() {
			return cameraStreamUrl(this.printStore.config, this.printStore.selectedPrinterId)
		},
		controls() {
			return this.printStore.printerControls
		},
		isOffline() {
			if (this.printStore.printerState.connected) {
				return false
			}
			return (this.printStore.printerState.state || '').toLowerCase() !== 'reconnecting'
		},
		isReconnecting() {
			return !this.printStore.printerState.connected
				&& (this.printStore.printerState.state || '').toLowerCase() === 'reconnecting'
		},
		showIdleGuide() {
			return this.printStore.printerState.connected
				&& !this.controls.isActive
				&& !this.printStore.printerState.filename
				&& !this.controls.isComplete
		},
		showPrintControl() {
			return this.printStore.printerState.connected
				&& (this.controls.isActive || this.printStore.printerState.filename)
				&& !this.controls.isComplete
		},
		elapsedLabel() {
			const d = this.printStore.printerState.printDuration
			if (d == null || Number.isNaN(d)) {
				return null
			}
			return formatPrintTime(d)
		},
		remainingLabel() {
			const remaining = this.printStore.remainingPrintSeconds
			if (remaining == null) {
				return null
			}
			return formatPrintTime(remaining)
		},
		etaLabel() {
			if (!this.remainingLabel) {
				return null
			}
			return `~${this.remainingLabel} remaining`
		},
		estimateActualLabel() {
			const row = this.printStore.estimateVsActual
			if (!row) {
				return null
			}
			const est = formatPrintTime(row.estimatedS)
			if (row.actualS == null) {
				return `Estimated ${est}`
			}
			const act = formatPrintTime(row.actualS)
			const delta = row.actualS - row.estimatedS
			const sign = delta >= 0 ? '+' : '−'
			const deltaLabel = formatPrintTime(Math.abs(delta))
			return `Estimated ${est} · Actual ${act} (${sign}${deltaLabel})`
		},
		progressSourceLabel() {
			return this.printStore.printerProgressSource === 'ws' ? 'Live (WebSocket)' : 'Polling'
		},
		progressPercentLabel() {
			const pct = this.printStore.printerState.progress * 100
			if (pct > 0 && pct < 1) {
				return `${pct.toFixed(1)}%`
			}
			return `${Math.round(pct)}%`
		},
		layerStatValue() {
			const layer = this.printStore.printerState.layer
			const total = this.printStore.printerState.layerCount
			if (layer == null || total == null) {
				return null
			}
			return `${layer}/${total}`
		},
		nozzleStatValue() {
			const cur = this.printStore.printerState.extruderTemp
			if (cur == null) {
				return '—'
			}
			return `${Math.round(cur)}°`
		},
		nozzleStatSub() {
			const tgt = this.printStore.printerState.extruderTarget
			if (tgt != null && tgt > 0) {
				return `→ ${Math.round(tgt)}°C`
			}
			return null
		},
		bedStatValue() {
			const cur = this.printStore.printerState.bedTemp
			if (cur == null) {
				return '—'
			}
			return `${Math.round(cur)}°`
		},
		bedStatSub() {
			const tgt = this.printStore.printerState.bedTarget
			if (tgt != null && tgt > 0) {
				return `→ ${Math.round(tgt)}°C`
			}
			return null
		},
		showPrintStats() {
			return this.showPrintControl && (
				this.elapsedLabel
				|| this.remainingLabel
				|| this.printStore.printerState.progress > 0
				|| this.layerStatValue
				|| this.nozzleStatValue !== '—'
				|| this.bedStatValue !== '—'
			)
		},
		cameraPlaceholderText() {
			if (!this.streamUrl) {
				return 'No camera URL configured — set webcam URL in NC Print settings.'
			}
			if (this.cameraError) {
				return this.cameraErrorMessage || 'Camera unavailable'
			}
			return 'Loading camera…'
		},
		/** All wrappable panels whose store-derived `when` predicate passes. */
		visiblePanels() {
			const out = []
			for (const zone of PANEL_ZONES) {
				for (const p of zone.panels) {
					if (typeof p.when === 'function' && !p.when(this.printStore)) {
						continue
					}
					out.push({ ...p, zone: zone.key })
				}
			}
			return out
		},
		/** Pinned panels in pin order (only those currently visible). */
		pinnedPanels() {
			const byId = new Map(this.visiblePanels.map((p) => [p.id, p]))
			return this.pinned.map((id) => byId.get(id)).filter(Boolean)
		},
		/** Zones with their unpinned, visible panels (drops empty zones). */
		zonesForRender() {
			const pinnedSet = new Set(this.pinned)
			return PANEL_ZONES
				.map((zone) => ({
					key: zone.key,
					label: zone.label,
					panels: this.visiblePanels.filter((p) => p.zone === zone.key && !pinnedSet.has(p.id)),
				}))
				.filter((zone) => zone.panels.length > 0)
		},
	},
	mounted() {
		void this.consumePendingPrintUpload()
		// Notification permission is now prompted explicitly via the chrome bell (WS3).
		window.addEventListener('keydown', this.onGlobalKeydown)
	},
	beforeDestroy() {
		window.removeEventListener('keydown', this.onGlobalKeydown)
	},
	watch: {
		'printStore.pendingPrintUpload'() {
			void this.consumePendingPrintUpload()
		},
	},
	methods: {
		openCameraFullscreen() {
			this.cameraFullscreen = true
		},
		closeCameraFullscreen() {
			this.cameraFullscreen = false
		},
		onGlobalKeydown(e) {
			if (e.key === 'Escape' && this.cameraFullscreen) {
				this.closeCameraFullscreen()
			}
		},
		async consumePendingPrintUpload() {
			const pending = this.printStore.pendingPrintUpload
			if (!pending?.blob) {
				return
			}
			const file = new File([pending.blob], pending.filename, { type: 'text/plain' })
			const ok = await this.uploadGcodeFile(file, this.startAfterUpload)
			if (ok) {
				this.printStore.clearPendingPrintUpload()
			}
		},
		onTogglePin(id) {
			this.pinned = togglePinned(id)
		},
		goSlice() {
			this.printStore.setActiveTab(TABS.SLICE)
		},
		goPrepare() {
			this.printStore.setActiveTab(TABS.PREPARE)
		},
		onPause() {
			return this.printStore.printPause()
		},
		onResume() {
			return this.printStore.printResume()
		},
		openCancelConfirm() {
			this.cancelConfirmOpen = true
		},
		closeCancelConfirm() {
			this.cancelConfirmOpen = false
		},
		onCancelConfirmed() {
			this.cancelConfirmOpen = false
			return this.printStore.printCancel()
		},
		onGcodeInput(e) {
			const file = e.target.files?.[0]
			if (file) {
				void this.uploadGcodeFile(file)
			}
			e.target.value = ''
		},
		async uploadGcodeFile(file, startAfterUpload = this.startAfterUpload) {
			if (!file?.name?.toLowerCase().endsWith('.gcode')) {
				toastError('Select a .gcode file')
				return false
			}
			this.uploadBusy = true
			try {
				await uploadAndStart(file, file.name, startAfterUpload, this.printerId)
				toastSuccess(startAfterUpload ? 'Print started' : 'G-code uploaded')
				await this.printStore.refreshPrinterState()
				return true
			} catch (e) {
				toastError('Upload failed', e)
				return false
			} finally {
				this.uploadBusy = false
			}
		},
		async pickGcodeFromFiles() {
			const picked = await pickFileFromNextcloud({
				title: 'Select G-code',
				filter: node => /\.gcode$/i.test(node?.basename || node?.displayname || ''),
				canPick: node => /\.gcode$/i.test(node?.basename || node?.displayname || ''),
				allowGcode: true,
			})
			if (picked?.file) {
				await this.uploadGcodeFile(picked.file)
			}
		},
		onPrintAgainUpload() {
			if (this.printStore.sliceJob.gcodeBlob) {
				void this.uploadGcodeFile(
					new File(
						[this.printStore.sliceJob.gcodeBlob],
						this.printStore.sliceJob.gcodeFilename || 'job.gcode',
						{ type: 'text/plain' },
					),
					true,
				)
			}
		},
	},
}
</script>

<template>
	<WorkspaceRail class="nc-print-print-tab">
		<PrintStatusBar />

		<MultiPrinterPicker />

		<UpdateStatusBanner />
		<UpdateControlPanel />
		<AnnouncementsBanner />

		<div v-if="isReconnecting" class="nc-print-banner nc-print-banner--warn" role="status">
			<p class="nc-print-banner__body">
				Reconnecting to Moonraker…
			</p>
		</div>

		<div v-else-if="isOffline" class="nc-print-banner nc-print-banner--danger" role="alert">
			<h2 class="nc-print-banner__title">
				<span class="nc-print-card__title-row">
					<NcPrintIcon name="alert" :size="18" />
					Printer offline
				</span>
			</h2>
			<p class="nc-print-banner__body">
				Cannot reach Moonraker for the selected printer. Check power, network, and Admin settings.
			</p>
			<p v-if="printStore.printerState.lastError" class="nc-print-banner__error">
				{{ printStore.printerState.lastError }}
			</p>
		</div>

		<PrintCompletionBanner @upload-last="onPrintAgainUpload" />

		<div v-if="showIdleGuide" class="nc-print-banner nc-print-banner--info">
			<h2 class="nc-print-banner__title">
				<span class="nc-print-card__title-row">
					<NcPrintIcon name="home" :size="18" />
					No active print
				</span>
			</h2>
			<p class="nc-print-banner__body">
				Slice a model and send G-code from the <strong>Slice</strong> tab, or upload G-code below.
			</p>
			<div class="nc-print-actions">
				<button type="button" class="nc-print-btn nc-print-btn--primary" @click="goSlice">
					Go to Slice
				</button>
				<button type="button" class="nc-print-btn" @click="goPrepare">
					Go to Prepare
				</button>
				<ReopenMenu />
			</div>
		</div>

		<div v-if="showPrintControl" class="nc-print-card">
			<div class="nc-print-card__header">
				<h2 class="nc-print-card__title">
					<span class="nc-print-card__title-row">
						<NcPrintIcon name="printer" :size="18" />
						Print control
					</span>
				</h2>
				<span class="nc-print-badge nc-print-badge--info">{{ printStore.printerStatusLabel }}</span>
			</div>

			<div v-if="printStore.printerState.filename" class="nc-print-print-jobhead">
				<GcodeThumbnail :filename="printStore.printerState.filename" :size="72" />
				<p class="nc-print-print-meta">
					<strong>{{ printStore.printerState.filename }}</strong>
				</p>
			</div>
			<p v-if="printStore.printerState.message" class="nc-print-print-meta nc-print-print-meta--muted">
				{{ printStore.printerState.message }}
			</p>
			<p v-if="estimateActualLabel" class="nc-print-print-meta nc-print-print-meta--muted">
				{{ estimateActualLabel }}
			</p>

			<div v-if="showPrintStats" class="nc-print-stat-grid">
				<div v-if="elapsedLabel" class="nc-print-stat">
					<span class="nc-print-stat__label">Elapsed</span>
					<span class="nc-print-stat__value">{{ elapsedLabel }}</span>
					<span v-if="etaLabel" class="nc-print-stat__sub">{{ etaLabel }}</span>
				</div>
				<div v-if="printStore.printerState.progress > 0" class="nc-print-stat">
					<span class="nc-print-stat__label">Progress</span>
					<span class="nc-print-stat__value">{{ progressPercentLabel }}</span>
					<span class="nc-print-stat__sub">{{ progressSourceLabel }}</span>
				</div>
				<div v-if="layerStatValue" class="nc-print-stat">
					<span class="nc-print-stat__label">Layer</span>
					<span class="nc-print-stat__value">{{ layerStatValue }}</span>
				</div>
				<div v-if="nozzleStatValue !== '—'" class="nc-print-stat">
					<span class="nc-print-stat__label">
						Nozzle
						<span
							v-if="printStore.isExtruderHeating"
							class="nc-print-dot nc-print-dot--heating"
							title="Heating" />
					</span>
					<span class="nc-print-stat__value">{{ nozzleStatValue }}</span>
					<span v-if="nozzleStatSub" class="nc-print-stat__sub">{{ nozzleStatSub }}</span>
				</div>
				<div v-if="bedStatValue !== '—'" class="nc-print-stat">
					<span class="nc-print-stat__label">
						Bed
						<span
							v-if="printStore.isBedHeating"
							class="nc-print-dot nc-print-dot--heating"
							title="Heating" />
					</span>
					<span class="nc-print-stat__value">{{ bedStatValue }}</span>
					<span v-if="bedStatSub" class="nc-print-stat__sub">{{ bedStatSub }}</span>
				</div>
			</div>

			<div v-if="controls.isActive" class="nc-print-progress">
				<div
					class="nc-print-progress__bar"
					:style="{ width: (printStore.printerState.progress * 100) + '%' }" />
			</div>

			<div class="nc-print-actions">
				<button
					type="button"
					class="nc-print-btn"
					:disabled="printStore.printControlBusy || !controls.canPause"
					@click="onPause">
					<NcPrintIcon name="pause" :size="14" />
					Pause
				</button>
				<button
					type="button"
					class="nc-print-btn nc-print-btn--primary"
					:disabled="printStore.printControlBusy || !controls.canResume"
					@click="onResume">
					<NcPrintIcon name="play" :size="14" />
					Resume
				</button>
				<button
					type="button"
					class="nc-print-btn nc-print-btn--danger"
					:disabled="printStore.printControlBusy || !controls.canCancel"
					@click="openCancelConfirm">
					<NcPrintIcon name="stop" :size="14" />
					Cancel
				</button>
			</div>
		</div>

		<!-- Pinned panels float to the top, in pin order. -->
		<div v-if="pinnedPanels.length" class="nc-print-zone">
			<h3 class="nc-print-zone__label">
				<NcPrintIcon name="pin" :size="13" /> Pinned
			</h3>
			<PrintPanel
				v-for="p in pinnedPanels"
				:key="'pin-' + p.id"
				:id="p.id"
				:title="p.title"
				:icon="p.icon"
				:default-open="p.open"
				:pinned="true"
				@toggle-pin="onTogglePin">
				<component :is="p.comp" />
			</PrintPanel>
		</div>

		<!-- Zoned, collapsible panels (forge-style Operate / Analyze). -->
		<div v-for="zone in zonesForRender" :key="zone.key" class="nc-print-zone">
			<h3 class="nc-print-zone__label">{{ zone.label }}</h3>
			<PrintPanel
				v-for="p in zone.panels"
				:key="p.id"
				:id="p.id"
				:title="p.title"
				:icon="p.icon"
				:default-open="p.open"
				:pinned="false"
				@toggle-pin="onTogglePin">
				<component :is="p.comp" />
			</PrintPanel>
		</div>

		<!-- Data-dependent panels that already self-hide when empty. -->
		<FilamentPanel />
		<SensorPanel />
		<TimelapsePanel />
		<QueuePanel />
		<div v-if="printStore.hasFeature('webcam')" class="nc-print-card"><WebcamListPanel /></div>

		<div class="nc-print-card">
			<h2 class="nc-print-card__title">
				<span class="nc-print-card__title-row">
					<NcPrintIcon name="upload" :size="18" />
					Send G-code
				</span>
			</h2>
			<label class="nc-print-switch" style="margin-bottom: 12px;">
				<input v-model="startAfterUpload" type="checkbox">
				<span class="nc-print-switch__slider" />
				<span class="nc-print-switch__label">Start print after upload</span>
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

		<EmergencyStopButton />

		<div v-if="cancelConfirmOpen" class="nc-print-dialog-backdrop" role="alertdialog" aria-labelledby="nc-print-cancel-title">
			<div class="nc-print-dialog">
				<h3 id="nc-print-cancel-title">Cancel print?</h3>
				<p>This will stop the current job on the printer. The partial print may need to be removed from the bed.</p>
				<div class="nc-print-actions">
					<button type="button" class="nc-print-btn" @click="closeCancelConfirm">
						Keep printing
					</button>
					<button type="button" class="nc-print-btn nc-print-btn--danger" @click="onCancelConfirmed">
						Cancel print
					</button>
				</div>
			</div>
		</div>

		<template #rail>
			<div class="nc-print-card">
				<div class="nc-print-card__header">
					<h2 class="nc-print-card__title">
						<span class="nc-print-card__title-row">
							<NcPrintIcon name="camera" :size="18" />
							Camera
						</span>
					</h2>
					<button
						v-if="cameraFrameUrl && !cameraError"
						type="button"
						class="nc-print-btn nc-print-btn--sm"
						title="Fullscreen camera"
						@click="openCameraFullscreen">
						<NcPrintIcon name="maximize" :size="14" />
						Expand
					</button>
				</div>
				<div class="nc-print-camera-panel">
					<img
						v-if="cameraFrameUrl && !cameraError"
						:src="cameraFrameUrl"
						alt="Printer camera stream"
						@error="onCameraError"
						@click="openCameraFullscreen">
					<div v-else class="nc-print-camera-placeholder">
						<p>{{ cameraPlaceholderText }}</p>
						<button v-if="cameraError && streamUrl" type="button" class="nc-print-btn" @click="retryCamera">
							Retry camera
						</button>
					</div>
				</div>
			</div>

			<JobHistoryPanel compact :limit="5" />

			<HistoryPanel />

			<PrintHistoryPanel />
		</template>

		<teleport to="body">
			<div
				v-if="cameraFullscreen"
				class="nc-print-camera-fullscreen"
				role="dialog"
				aria-label="Printer camera fullscreen"
				@click.self="closeCameraFullscreen">
				<button
					type="button"
					class="nc-print-btn nc-print-camera-fullscreen__close"
					@click="closeCameraFullscreen">
					<NcPrintIcon name="close" :size="16" />
					Close
				</button>
				<img
					v-if="cameraFrameUrl && !cameraError"
					:src="cameraFrameUrl"
					alt="Printer camera stream (fullscreen)"
					@error="onCameraError">
				<p v-else class="nc-print-camera-fullscreen__placeholder">{{ cameraPlaceholderText }}</p>
			</div>
		</teleport>
	</WorkspaceRail>
</template>

<style scoped>
.nc-print-zone {
	display: flex;
	flex-direction: column;
	gap: var(--nc-gcs-space-md, 12px);
}

.nc-print-zone__label {
	align-items: center;
	color: var(--nc-gcs-text-muted);
	display: flex;
	font-size: 11px;
	font-weight: 700;
	gap: 6px;
	letter-spacing: 0.08em;
	margin: var(--nc-gcs-space-sm, 8px) 0 0;
	text-transform: uppercase;
}

.nc-print-print-meta {
	font-size: var(--nc-gcs-text-sm);
	margin: 0 0 8px;
}

.nc-print-print-jobhead {
	align-items: center;
	display: flex;
	gap: 12px;
	margin-bottom: 8px;
}

.nc-print-print-jobhead .nc-print-print-meta {
	margin: 0;
}

.nc-print-print-meta--muted {
	color: var(--nc-gcs-text-muted);
}

.nc-print-stat__label {
	align-items: center;
	display: inline-flex;
	gap: 6px;
}

.nc-print-dialog-backdrop {
	align-items: center;
	background: rgba(0, 0, 0, 0.45);
	display: flex;
	inset: 0;
	justify-content: center;
	padding: 16px;
	position: fixed;
	z-index: 9999;
}

.nc-print-dialog {
	background: var(--nc-gcs-bg-surface);
	border: 1px solid var(--nc-gcs-border);
	border-radius: var(--nc-gcs-radius);
	max-width: 420px;
	padding: var(--nc-gcs-space-lg);
	width: 100%;
}

.nc-print-dialog h3 {
	margin: 0 0 8px;
}

.nc-print-dialog p {
	color: var(--nc-gcs-text-secondary);
	font-size: var(--nc-gcs-text-sm);
	margin: 0 0 16px;
}

.nc-print-camera-placeholder p {
	margin: 0 0 8px;
}

.nc-print-camera-panel img {
	cursor: zoom-in;
}

.nc-print-camera-fullscreen {
	align-items: center;
	background: rgba(0, 0, 0, 0.88);
	display: flex;
	inset: 0;
	justify-content: center;
	padding: 24px;
	position: fixed;
	z-index: 9999;
}

.nc-print-camera-fullscreen img {
	cursor: zoom-out;
	max-height: 100%;
	max-width: 100%;
	object-fit: contain;
}

.nc-print-camera-fullscreen__close {
	position: absolute;
	right: 16px;
	top: 16px;
	z-index: 1;
}

.nc-print-camera-fullscreen__placeholder {
	color: #fff;
}
</style>
