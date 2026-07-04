import { defineStore } from 'pinia'
import { fetchProfiles, sliceStream, downloadGcode, uploadAndStart, cancelSliceJob } from '@/services/slicer-api.js'
import {
	buildSliceOverrides,
	mergeProfileSettings,
	mergedToOverrideForm,
	pickDefaultProfileId,
	parseStlMetadata,
	mapSliceStageLabel,
	parseExtruderCount,
	resolveFilamentIds,
} from '@/services/slicer-utils.js'
import { fetchState, uploadAndStart as moonrakerUpload } from '@/services/moonraker-api.js'
import { MoonrakerWsClient } from '@/services/moonraker-ws.js'
import { fetchConfig } from '@/services/config-api.js'
import { fetchAppStatus } from '@/services/status-api.js'
import { fetchModelBlob, resolveFile } from '@/services/files-api.js'
import { saveGcodeToFiles as saveGcodeApi } from '@/services/gcode-save-api.js'
import { predictEta as predictEtaApi, recordEta as recordEtaApi } from '@/services/eta-api.js'
import { discoverPrinters as discoverPrintersApi, fetchCapabilities as fetchCapabilitiesApi } from '@/services/printers-api.js'
import { validateModelFile } from '@/shared/modelFileNode.js'
import { convert3mfToStlBuffer, meshToStlBuffer, list3mfBuildItems } from '@/services/mesh-convert.js'
import { toastError, toastSuccess, toastWarning, toastInfo } from '@/services/toast.js'
import { previewBlocked, printMonitorReachable, sliceBlockReason as computeSliceBlockReason } from '@/utils/workflow-gates.js'
import { TABS } from '@/constants/tabs.js'

// Re-exported for backward compatibility; the source of truth is the leaf
// module @/constants/tabs.js (see that file for why).
export { TABS }

const PREFS_KEY = 'nc_print_prefs_v1'
const JOB_HISTORY_KEY = 'nc_print_job_history_v1'
const RECENT_MODELS_KEY = 'nc_print_recent_models_v1'
const RECENT_PRINTERS_KEY = 'nc_print_recent_printers_v1'
const JOB_HISTORY_MAX = 20
const RECENT_MODELS_MAX = 5
const RECENT_PRINTERS_MAX = 5
const PRESETS_KEY = 'nc_print_presets_v1'
const NOTIF_PROMPT_KEY = 'nc_print_notif_prompted_v1'

/** Find a profile row by id (string-compared), tolerant of number/string ids. */
function findById(list, id) {
	return Array.isArray(list) ? list.find(p => String(p.id) === String(id)) : undefined
}

function loadPrefs() {
	try {
		return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')
	} catch {
		return {}
	}
}

function savePrefs(partial) {
	try {
		const cur = loadPrefs()
		localStorage.setItem(PREFS_KEY, JSON.stringify({ ...cur, ...partial }))
	} catch {
		// private browsing
	}
}

function loadJobHistory() {
	try {
		const rows = JSON.parse(localStorage.getItem(JOB_HISTORY_KEY) || '[]')
		return Array.isArray(rows) ? rows : []
	} catch {
		return []
	}
}

function persistJobHistory(rows) {
	try {
		localStorage.setItem(JOB_HISTORY_KEY, JSON.stringify(rows.slice(0, JOB_HISTORY_MAX)))
	} catch {
		// private browsing
	}
}

function loadRecentModels() {
	try {
		const rows = JSON.parse(localStorage.getItem(RECENT_MODELS_KEY) || '[]')
		return Array.isArray(rows) ? rows : []
	} catch {
		return []
	}
}

function persistRecentModels(rows) {
	try {
		localStorage.setItem(RECENT_MODELS_KEY, JSON.stringify(rows.slice(0, RECENT_MODELS_MAX)))
	} catch {
		// private browsing
	}
}

function loadRecentPrinters() {
	try {
		const rows = JSON.parse(localStorage.getItem(RECENT_PRINTERS_KEY) || '[]')
		return Array.isArray(rows) ? rows : []
	} catch {
		return []
	}
}

function persistRecentPrinters(rows) {
	try {
		localStorage.setItem(RECENT_PRINTERS_KEY, JSON.stringify(rows.slice(0, RECENT_PRINTERS_MAX)))
	} catch {
		// private browsing
	}
}

function loadPresets() {
	try {
		return JSON.parse(localStorage.getItem(PRESETS_KEY) || '{}')
	} catch {
		return {}
	}
}

function savePresets(all) {
	try {
		localStorage.setItem(PRESETS_KEY, JSON.stringify(all))
	} catch {
		// private browsing
	}
}

function mapPrinterState(data = {}, lastError = '') {
	return {
		connected: !!data.connected,
		state: data.state || data.status || 'unknown',
		message: data.message || '',
		progress: data.progress ?? 0,
		extruderTemp: data.extruder_temp ?? data.extruderTemp ?? null,
		extruderTarget: data.extruder_target ?? data.extruderTarget ?? null,
		extruderPower: data.extruder_power ?? data.extruderPower ?? null,
		bedTemp: data.bed_temp ?? data.bedTemp ?? null,
		bedTarget: data.bed_target ?? data.bedTarget ?? null,
		bedPower: data.bed_power ?? data.bedPower ?? null,
		fanSpeed: data.fan_speed ?? data.fanSpeed ?? null,
		speedFactor: data.speed_factor ?? data.speedFactor ?? null,
		flowFactor: data.flow_factor ?? data.flowFactor ?? null,
		zOffset: data.z_offset ?? data.zOffset ?? null,
		filename: data.filename ?? null,
		printDuration: data.print_duration ?? data.printDuration ?? null,
		totalDuration: data.total_duration ?? data.totalDuration ?? null,
		layer: data.layer ?? null,
		layerCount: data.layer_count ?? data.layerCount ?? null,
		lastError: data.lastError || lastError || '',
	}
}

function defaultMeshState() {
	return {
		position: [0, 0, 0],
		rotation: [0, 0, 0],
		scale: [1, 1, 1],
		sliceBlob: null,
		dirty: false,
		appliedAt: null,
		autoApply: true,
		applying: false,
	}
}

export const usePrintStore = defineStore('print', {
	state: () => ({
		activeTab: TABS.PREPARE,
		config: null,
		bootstrap: null,
		appStatus: {
			slicer_ok: false,
			moonraker_ok: false,
			slicer_enabled: true,
			moonraker_enabled: true,
			slicer_error: null,
			moonraker_error: null,
			printer_display_name: '',
			// Part B (WS10-WS16) feature detection + console toggle.
			console_enabled: false,
			moonraker_features: {
				history: false,
				job_queue: false,
				timelapse: false,
				spoolman: false,
				power: false,
			},
			loaded: false,
		},
		model: {
			file: null,
			sliceFile: null,
			name: '',
			size: 0,
			source: null,
			fileId: null,
			davPath: '',
			convertError: '',
			convertedFrom3mf: false,
		},
		modelMeta: {
			bbox: null,
			fitsBed: true,
			triangleCount: 0,
			parseError: '',
			previewSkipped: false,
		},
		meshHealth: {
			analyzed: false,
			triangleCount: 0,
			bbox: null,
			openEdgeCount: 0,
			overhangPct: 0,
			watertight: false,
		},
		threeMfBuildItems: [],
		threeMfSelectedIds: [],
		meshState: {
			position: [0, 0, 0],
			rotation: [0, 0, 0],
			scale: [1, 1, 1],
			sliceBlob: null,
			dirty: false,
			appliedAt: null,
			autoApply: true,
			applying: false,
		},
		profiles: {
			printers: [],
			filaments: [],
			processes: [],
			loaded: false,
			error: '',
		},
		selection: {
			printerId: '',
			filamentId: '',
			filamentIds: [],
			processId: '',
		},
		selectedPrinterId: '',
		// Recently-used target printers (MRU, most-recent-first). Each:
		// { id, name, at }. Persisted per-browser like recentModels.
		recentPrinters: loadRecentPrinters(),
		// Printers found by the on-demand LAN scan (session-only, not saved to
		// admin config). Each: the discover() row + a derived id/name/default.
		discoveredPrinters: [],
		discovering: false,
		discoverError: '',
		// Live-detected capabilities per printer id (build volume, extruders,
		// model/OS), cached for the session. { [id]: {..} | null (=fetched, none) }
		printerCapabilities: {},
		savedPresets: {},
		overrides: {
			layerHeight: '',
			lineWidth: '',
			perimeters: '',
			infillDensity: '',
			printSpeed: '',
			firstLayerSpeed: '',
			nozzleTemp: '',
			bedTemp: '',
			fanSpeed: '',
			retractionLength: '',
			retractionSpeed: '',
			enableSupport: false,
			supportType: '',
			supportThreshold: '',
			brimWidth: '',
			raftLayers: '',
			skirtLoops: '',
			adaptiveLayerHeight: false,
			ironingType: '',
			fuzzySkin: '',
			seamPosition: '',
		},
		overridesCollapsed: true,
		// Pause / filament-change points injected into gcode at a Z height.
		// Each: { height: number, type: 'filament_change'|'pause' }
		pauses: [],
		sliceJob: {
			status: 'idle',
			stage: '',
			pct: 0,
			layer: 0,
			totalLayers: 0,
			jobId: null,
			gcodeBlob: null,
			gcodeFilename: '',
			gcodeSizeBytes: 0,
			estimatedTimeS: 0,
			filamentUsedG: 0,
			filamentBreakdown: [],
			layers: 0,
			materialStats: {},
			savedDavPath: '',
			backendLabel: 'forge-slicer',
			sentTo: '',
			printing: false,
			error: '',
		},
		// Smart-ETA prediction for the current slice (learned slicer-vs-actual
		// correction). null until predicted; { predicted_minutes, multiplier,
		// samples, confidence }.
		etaPrediction: null,
		printerState: {
			connected: false,
			state: 'unknown',
			message: '',
			progress: 0,
			extruderTemp: null,
			extruderTarget: null,
			extruderPower: null,
			bedTemp: null,
			bedTarget: null,
			bedPower: null,
			fanSpeed: null,
			speedFactor: null,
			flowFactor: null,
			zOffset: null,
			filename: null,
			printDuration: null,
			totalDuration: null,
			layer: null,
			layerCount: null,
			lastError: '',
		},
		_lastNotifiedPrintState: '',
		pendingPrintUpload: null,
		prePrintModal: {
			visible: false,
			resolve: null,
		},
		jobHistory: loadJobHistory(),
		savingGcode: false,
		_pollTimer: null,
		_statusTimer: null,
		_wsClient: null,
		printerProgressSource: 'poll',
		// WS11: G-code console scrollback (capped ring buffer).
		consoleLog: [],
	}),

	getters: {
		hasModel: (s) => !!s.model.file,
		slicerReady: (s) => s.appStatus.loaded && s.appStatus.slicer_enabled && s.appStatus.slicer_ok,
		// Part B: admin console toggle + Moonraker feature detection.
		consoleEnabled: (s) => !!s.appStatus.console_enabled,
		printerFeatures: (s) => s.appStatus.moonraker_features || {},
		hasFeature: (s) => (name) => !!(s.appStatus.moonraker_features || {})[name],
		profilesReady: (s) => s.selection.printerId && s.selection.filamentId && s.selection.processId,
		buildVolume(state) {
			const p = state.profiles.printers.find(x => String(x.id) === String(state.selection.printerId))
			if (!p?.settings_json) {
				return [220, 220, 220]
			}
			try {
				const s = typeof p.settings_json === 'string' ? JSON.parse(p.settings_json) : p.settings_json
				if (Array.isArray(s.buildVolume) && s.buildVolume.length === 3) {
					return s.buildVolume
				}
			} catch {
				// ignore
			}
			return [220, 220, 220]
		},
		selectedProfileNames(state) {
			const find = (list, id) => list.find(p => String(p.id) === String(id))
			return {
				printer: find(state.profiles.printers, state.selection.printerId)?.name || '—',
				filament: find(state.profiles.filaments, state.selection.filamentId)?.name || '—',
				process: find(state.profiles.processes, state.selection.processId)?.name || '—',
			}
		},
		printerStatusLabel(state) {
			if (!state.printerState.connected) {
				return 'Offline'
			}
			const st = (state.printerState.state || '').toLowerCase()
			if (st.includes('print')) {
				return 'Printing'
			}
			if (st.includes('pause')) {
				return 'Paused'
			}
			if (st.includes('ready') || st.includes('standby') || st.includes('complete')) {
				return 'Ready'
			}
			if (st.includes('error')) {
				return 'Error'
			}
			return state.printerState.state || 'Connected'
		},
		printerStatusClass(state) {
			const label = state.printerState.connected
				? (state.printerState.state || '').toLowerCase()
				: 'offline'
			if (!state.printerState.connected) {
				return 'idle'
			}
			if (label.includes('print')) {
				return 'printing'
			}
			if (label.includes('error')) {
				return 'error'
			}
			return 'ready'
		},
		printerControls(state) {
			const st = (state.printerState.state || '').toLowerCase()
			return {
				isPrinting: st === 'printing',
				isPaused: st === 'paused',
				isComplete: st === 'complete',
				isError: st === 'error',
				isActive: st === 'printing' || st === 'paused',
				canPause: st === 'printing',
				canResume: st === 'paused',
				canCancel: st === 'printing' || st === 'paused',
			}
		},
		remainingPrintSeconds(state) {
			const total = state.printerState.totalDuration
			const elapsed = state.printerState.printDuration
			if (total == null || elapsed == null || !Number.isFinite(total) || !Number.isFinite(elapsed)) {
				return null
			}
			return Math.max(0, total - elapsed)
		},
		isExtruderHeating(state) {
			const { extruderTemp, extruderTarget, extruderPower } = state.printerState
			if (extruderTarget == null || extruderTarget <= 0) {
				return false
			}
			if (extruderTemp == null) {
				return (extruderPower ?? 0) > 0
			}
			return extruderTemp < extruderTarget - 2 && (extruderPower ?? 0) > 0.01
		},
		isBedHeating(state) {
			const { bedTemp, bedTarget, bedPower } = state.printerState
			if (bedTarget == null || bedTarget <= 0) {
				return false
			}
			if (bedTemp == null) {
				return (bedPower ?? 0) > 0
			}
			return bedTemp < bedTarget - 2 && (bedPower ?? 0) > 0.01
		},
		prepareComplete(state) {
			const slicerOk = state.appStatus.loaded && state.appStatus.slicer_enabled && state.appStatus.slicer_ok
			const sliceReady = !state.model.file
				? false
				: !state.model.name?.toLowerCase().endsWith('.3mf')
					|| !!state.model.sliceFile
			const meshReady = !state.model.file
				|| (
					sliceReady
					&& !state.model.convertError
					&& !state.meshState.dirty
				)
			return !!state.model.file
				&& !previewBlocked(state)
				&& meshReady
				&& !!state.selection.printerId
				&& !!state.selection.filamentId
				&& !!state.selection.processId
				&& slicerOk
		},
		sliceComplete(state) {
			return state.sliceJob.status === 'done'
		},
		// WS4/WS5: filament + time rollup from the last completed slice in this
		// session. Null until a slice finishes.
		lastCompletedSliceStats(state) {
			if (state.sliceJob.status !== 'done') {
				return null
			}
			const j = state.sliceJob
			return {
				estimatedTimeS: j.estimatedTimeS || 0,
				filamentUsedG: j.filamentUsedG || 0,
				// Model/support grams live under materialStats (set by
				// _applyMaterialStats), not directly on sliceJob.
				modelFilamentG: j.materialStats?.modelFilamentG ?? null,
				supportFilamentG: j.materialStats?.supportFilamentG ?? null,
				gcodeFilename: j.gcodeFilename || '',
				gcodeSizeBytes: j.gcodeSizeBytes || 0,
			}
		},
		prepareChecklist(state) {
			const rows = [
				{
					id: 'model',
					label: 'Model loaded',
					ok: !!state.model.file,
					hint: 'Import or pick a file from Nextcloud',
					action: 'model',
				},
				{
					id: 'mesh',
					label: 'Slice-ready mesh',
					// Mesh checks are not applicable until a model is loaded —
					// show them as pending (neutral) rather than a misleading ✓.
					pending: !state.model.file,
					ok: !state.model.file
						|| (
							(!state.model.name?.toLowerCase().endsWith('.3mf') || !!state.model.sliceFile)
							&& !state.model.convertError
							&& !state.meshState.dirty
						),
					hint: state.model.convertError
						|| (state.meshState.dirty ? 'Apply viewport transform to slice mesh' : 'Waiting for 3MF mesh extraction…'),
					action: 'mesh',
				},
				{
					id: 'preview',
					label: 'Mesh preview available',
					pending: !state.model.file,
					ok: !state.model.file || !previewBlocked(state),
					hint: 'No mesh preview — re-import or wait for 3MF extraction',
					action: 'model',
				},
				{
					id: 'watertight',
					label: 'Mesh watertight',
					pending: !state.model.file,
					ok: !state.model.file
						|| (state.meshHealth.analyzed && state.meshHealth.watertight),
					hint: state.meshHealth.analyzed
						? `${state.meshHealth.openEdgeCount} open edges — try Repair`
						: 'Run Analyze on the mesh health panel',
					action: 'watertight',
				},
				{
					id: 'printer',
					label: 'Printer profile',
					ok: !!state.selection.printerId,
					hint: 'Choose a printer on Prepare (or check slicer profiles)',
					action: 'printer',
				},
				{
					id: 'filament',
					label: 'Filament profile',
					ok: !!state.selection.filamentId,
					hint: 'Choose a filament profile',
					action: 'filament',
				},
				{
					id: 'process',
					label: 'Process / quality profile',
					ok: !!state.selection.processId,
					hint: 'Choose a process profile',
					action: 'process',
				},
				{
					id: 'slicer',
					label: 'Slicer service online',
					ok: state.appStatus.loaded && state.appStatus.slicer_enabled && state.appStatus.slicer_ok,
					hint: 'Start forge-slicer or check Admin settings',
					action: 'slicer',
				},
			]
			return rows
		},
		firstPrepareBlocker(state) {
			for (const row of [
				{ ok: !!state.model.file, label: 'Model loaded', hint: 'Import or pick a file from Nextcloud' },
				{
					ok: !state.model.file
						|| (
							(!state.model.name?.toLowerCase().endsWith('.3mf') || !!state.model.sliceFile)
							&& !state.model.convertError
							&& !state.meshState.dirty
						),
					label: 'Slice-ready mesh',
					hint: state.model.convertError
						|| (state.meshState.dirty ? 'Apply viewport transform to slice mesh' : '3MF mesh extraction failed — export STL'),
				},
				{ ok: !!state.selection.printerId, label: 'Printer profile', hint: 'Choose a printer on Prepare' },
				{ ok: !!state.selection.filamentId, label: 'Filament profile', hint: 'Choose a filament profile' },
				{ ok: !!state.selection.processId, label: 'Process profile', hint: 'Choose a process profile' },
				{ ok: state.appStatus.loaded && state.appStatus.slicer_enabled && state.appStatus.slicer_ok, label: 'Slicer service', hint: 'Start forge-slicer' },
			]) {
				if (!row.ok) {
					return `${row.label}: ${row.hint}`
				}
			}
			return ''
		},
		printStepEnabled(state) {
			return state.sliceJob.status === 'done'
				|| !!state.pendingPrintUpload
				|| state.printerState.filename
				|| (state.printerState.state || '').toLowerCase().includes('print')
				|| (state.printerState.state || '').toLowerCase().includes('pause')
		},
		// WS8: the Print tab is always a live monitor when a printer is
		// reachable, independent of slice status. Navigation is gated on
		// (printMonitorReachable || printStepEnabled); printStepEnabled keeps
		// the "next step / done ✓" progress semantics only.
		printMonitorReachable(state) {
			return printMonitorReachable(state)
		},
		workflowStepSubtitle(state) {
			return (stepId) => {
				const profileNames = (() => {
					const find = (list, id) => list.find(p => String(p.id) === String(id))
					const printer = find(state.profiles.printers, state.selection.printerId)?.name
					const filament = find(state.profiles.filaments, state.selection.filamentId)?.name
					const process = find(state.profiles.processes, state.selection.processId)?.name
					if (printer && filament && process) {
						return `${printer} · ${filament} · ${process}`
					}
					return ''
				})()

				if (stepId === TABS.PREPARE) {
					const model = state.model.name || 'Import a model'
					if (profileNames) {
						return `${model} · ${profileNames}`
					}
					return model
				}
				if (stepId === TABS.SLICE) {
					if (state.sliceJob.status === 'running') {
						return `Slicing ${state.sliceJob.pct}%`
					}
					if (state.sliceJob.status === 'done') {
						return state.sliceJob.gcodeFilename
							? `Slice complete · ${state.sliceJob.gcodeFilename}`
							: 'Slice complete'
					}
					if (state.sliceJob.status === 'error') {
						return state.sliceJob.error
							? `Slice failed: ${state.sliceJob.error}`
							: 'Slice failed'
					}
					if (state.meshState.dirty) {
						return 'Apply mesh transform before slice'
					}
					return state.model.file ? 'Ready to slice' : 'Load model first'
				}
				if (stepId === TABS.PRINT) {
					if (state.printerState.filename) {
						return state.printerState.filename
					}
					if (!state.printerState.connected) {
						return 'Offline'
					}
					const st = (state.printerState.state || '').toLowerCase()
					if (st.includes('print')) {
						return 'Printing'
					}
					if (st.includes('pause')) {
						return 'Paused'
					}
					return state.printerState.state || 'Ready'
				}
				return ''
			}
		},
		sliceBlockReason(state) {
			// Delegate to the shared pure helper so the store getter and unit
			// tests never drift (WS7).
			return computeSliceBlockReason(state)
		},
		configuredPrinters(state) {
			const rows = state.config?.multi_printers
			if (Array.isArray(rows) && rows.length) {
				return rows
			}
			return [{
				id: 'default',
				name: state.appStatus.printer_display_name || state.config?.printer_display_name || 'Printer',
				default: true,
			}]
		},
		activeTargetPrinter(state) {
			const id = state.selectedPrinterId || state.configuredPrinters.find(p => p.default)?.id || state.configuredPrinters[0]?.id
			return state.configuredPrinters.find(p => String(p.id) === String(id)) || state.configuredPrinters[0] || null
		},
		/**
		 * Printer-picker groups: Recent (MRU, resolved against configured), then
		 * the remaining Configured printers, then Found-on-network candidates
		 * (deduped against configured/recent). Feeds MultiPrinterPicker's
		 * optgroups so the printers you use float to the top.
		 */
		printerPickerGroups(state) {
			const configured = this.configuredPrinters
			const byId = new Map(configured.map(p => [String(p.id), p]))
			// Recent: only those still present in the configured set, in MRU order.
			const recent = []
			const recentIds = new Set()
			for (const r of state.recentPrinters) {
				const p = byId.get(String(r.id))
				if (p && !recentIds.has(String(p.id))) {
					recent.push(p)
					recentIds.add(String(p.id))
				}
			}
			// Configured minus the ones already shown under Recent.
			const rest = configured.filter(p => !recentIds.has(String(p.id)))
			// Discovered: drop anything whose URL/host already matches a
			// configured printer (avoid offering to "add" what you already have).
			const knownUrls = new Set(
				configured.map(p => String(p.moonraker_url || '').toLowerCase()).filter(Boolean),
			)
			const discovered = state.discoveredPrinters.filter(
				d => !knownUrls.has(String(d.moonraker_url || '').toLowerCase()),
			)
			return { recent, configured: rest, discovered }
		},
		/** Live-detected capabilities for the active target printer (or null). */
		activePrinterCapabilities(state) {
			const id = this.activeTargetPrinter?.id
			return id != null ? (state.printerCapabilities[String(id)] ?? null) : null
		},
		/**
		 * Compact human label for the active printer's capabilities, e.g.
		 * "308×308×315 · 1 extruder · enclosed". Empty string when unknown.
		 */
		activePrinterCapabilityLabel() {
			const c = this.activePrinterCapabilities
			if (!c) {
				return ''
			}
			const parts = []
			if (c.build_volume) {
				parts.push(`${c.build_volume.x}×${c.build_volume.y}×${c.build_volume.z}`)
			}
			if (c.extruders > 0) {
				parts.push(`${c.extruders} extruder${c.extruders > 1 ? 's' : ''}`)
			}
			if (c.has_enclosure) {
				parts.push('enclosed')
			}
			if (c.model) {
				parts.push(c.model)
			}
			return parts.join(' · ')
		},
		extruderCount(state) {
			return parseExtruderCount(state.profiles, state.selection.printerId)
		},
		sliceStageLabel(state) {
			return mapSliceStageLabel(state.sliceJob.stage)
		},
		estimateVsActual(state) {
			const est = state.sliceJob.estimatedTimeS
			const act = state.printerState.printDuration
			if (!est && act == null) {
				return null
			}
			return { estimatedS: est || 0, actualS: act ?? null }
		},
		has3mfError(state) {
			return !!state.model.name?.toLowerCase().endsWith('.3mf') && !!state.model.convertError
		},
		hasGcodeDownloadError(state) {
			return state.sliceJob.status === 'done' && !!state.sliceJob.error && !state.sliceJob.gcodeBlob
		},
		recentModels(state) {
			const prefs = loadPrefs()
			const rows = Array.isArray(prefs.recentModels) ? prefs.recentModels : []
			return rows.map((r, i) => ({
				...r,
				key: `${r.name}:${r.size}:${r.at || i}`,
			}))
		},
	},

	actions: {
		setBootstrap(data) {
			this.bootstrap = data || null
		},

		setActiveTab(tab) {
			if (Object.values(TABS).includes(tab)) {
				this.activeTab = tab
			}
		},

		setModel(file, source = 'import', meta = {}) {
			const check = validateModelFile(file)
			if (!check.ok) {
				toastError(check.error)
				return false
			}
			this.model = {
				file,
				sliceFile: null,
				name: file?.name || '',
				size: file?.size || 0,
				source,
				fileId: meta.file_id ?? meta.fileId ?? null,
				davPath: meta.dav_path ?? meta.davPath ?? '',
				convertError: '',
				convertedFrom3mf: false,
			}
			this.meshState = defaultMeshState()
			this.resetMeshHealth()
			this.threeMfBuildItems = []
			this.threeMfSelectedIds = []
			this._updateModelMetaFromFile(file)
			this._rememberRecentModel(file, source, meta)
			void this._loadThreeMfBuildItems(file)
			void this._prepareSliceFile(file)
			return true
		},

		resetMeshHealth() {
			this.meshHealth = {
				analyzed: false,
				triangleCount: 0,
				bbox: null,
				openEdgeCount: 0,
				overhangPct: 0,
				watertight: false,
			}
		},

		setMeshHealth(result) {
			if (!result) {
				this.resetMeshHealth()
				return
			}
			this.meshHealth = {
				analyzed: true,
				triangleCount: result.triangleCount ?? 0,
				bbox: result.bbox ?? null,
				openEdgeCount: result.openEdgeCount ?? result.openEdges ?? 0,
				overhangPct: result.overhangPct ?? 0,
				watertight: !!result.watertight,
			}
		},

		async _loadThreeMfBuildItems(file) {
			if (!file?.name?.toLowerCase().endsWith('.3mf')) {
				this.threeMfBuildItems = []
				this.threeMfSelectedIds = []
				return
			}
			try {
				const items = await list3mfBuildItems(await file.arrayBuffer())
				this.threeMfBuildItems = items
				this.threeMfSelectedIds = items.filter(i => i.printable).map(i => String(i.id))
			} catch {
				this.threeMfBuildItems = []
				this.threeMfSelectedIds = []
			}
		},

		setThreeMfSelection(ids) {
			this.threeMfSelectedIds = (ids || []).map(String)
			void this._prepareSliceFile(this.model.file)
		},

		async _prepareSliceFile(file) {
			if (!file?.name) {
				return
			}
			const lower = file.name.toLowerCase()
			if (!lower.endsWith('.3mf')) {
				this.model.sliceFile = null
				this.model.convertedFrom3mf = false
				this.model.convertError = ''
				return
			}
			try {
				const options = this.threeMfSelectedIds.length
					? { selectedIds: this.threeMfSelectedIds }
					: {}
				const stlBuf = await convert3mfToStlBuffer(await file.arrayBuffer(), options)
				const stem = file.name.replace(/\.3mf$/i, '')
				this.model.sliceFile = new File([stlBuf], `${stem}.stl`, { type: 'application/octet-stream' })
				this.model.convertedFrom3mf = true
				this.model.convertError = ''
				toastInfo('3MF mesh extracted — slicing will use a converted STL (Orca project files are not sent raw).')
			} catch (e) {
				this.model.sliceFile = null
				this.model.convertedFrom3mf = false
				this.model.convertError = e?.message || '3MF conversion failed'
				toastWarning(`3MF could not be converted: ${this.model.convertError}. Export STL from your slicer.`)
			}
		},

		sliceModelFile() {
			if (this.meshState.sliceBlob && !this.meshState.dirty) {
				return this.meshState.sliceBlob
			}
			return this.model.sliceFile || this.model.file
		},

		markMeshDirty() {
			if (!this.model.file) {
				return
			}
			this.meshState.dirty = true
			this._persistMeshTransform()
		},

		setMeshTransform(transform) {
			if (!transform) {
				return
			}
			if (Array.isArray(transform.position) && transform.position.length === 3) {
				this.meshState.position = [...transform.position]
			}
			if (Array.isArray(transform.rotation) && transform.rotation.length === 3) {
				this.meshState.rotation = [...transform.rotation]
			}
			if (Array.isArray(transform.scale) && transform.scale.length === 3) {
				this.meshState.scale = [...transform.scale]
			}
			this._persistMeshTransform()
		},

		async exportMeshFromViewport(viewport) {
			if (!viewport?.exportTransformedMesh) {
				throw new Error('Viewport export unavailable')
			}
			const exported = await viewport.exportTransformedMesh()
			if (!exported?.positions) {
				throw new Error('No mesh to export')
			}
			const stlBuf = meshToStlBuffer(exported)
			const stem = (this.model.name || 'model').replace(/\.[^.]+$/, '')
			const filename = `${stem}-prepared.stl`
			return new File([stlBuf], filename, { type: 'application/octet-stream' })
		},

		async applyMeshToSlice(viewport, { silent = false } = {}) {
			if (!this.model.file) {
				if (!silent) {
					toastError('No model loaded')
				}
				return false
			}
			if (!viewport?.getTransform) {
				if (!silent) {
					toastError('Viewport transform unavailable')
				}
				return false
			}
			this.meshState.applying = true
			try {
				const transform = viewport.getTransform()
				this.setMeshTransform(transform)
				const sliceFile = await this.exportMeshFromViewport(viewport)
				this.meshState.sliceBlob = sliceFile
				this.meshState.dirty = false
				this.meshState.appliedAt = new Date().toISOString()
				this._persistMeshTransform()
				if (transform?.bbox) {
					this.setModelMeta({ bbox: transform.bbox })
				}
				if (!silent) {
					toastSuccess('Mesh applied for slicing')
				}
				return true
			} catch (e) {
				if (!silent) {
					toastError('Could not apply mesh transform', e)
				}
				return false
			} finally {
				this.meshState.applying = false
			}
		},

		async _updateModelMetaFromFile(file) {
			this.modelMeta = { bbox: null, fitsBed: true, triangleCount: 0, parseError: '', previewSkipped: false }
			if (!file?.name?.toLowerCase().endsWith('.stl')) {
				this.modelMeta.previewSkipped = true
				return
			}
			try {
				const buf = await file.arrayBuffer()
				const meta = parseStlMetadata(buf)
				this.modelMeta.triangleCount = meta.triangleCount
				this.modelMeta.bbox = meta.bbox
				if (meta.bbox) {
					const [bx, by] = this.buildVolume
					this.modelMeta.fitsBed = meta.bbox.x <= bx && meta.bbox.y <= by
				}
			} catch (e) {
				this.modelMeta.parseError = e?.message || 'Parse failed'
			}
		},

		setModelMeta(meta) {
			if (!meta) {
				return
			}
			this.modelMeta = {
				...this.modelMeta,
				bbox: meta.bbox || this.modelMeta.bbox,
				triangleCount: meta.triangleCount ?? this.modelMeta.triangleCount,
				previewSkipped: !!meta.previewSkipped,
			}
			if (meta.bbox) {
				const [bx, by] = this.buildVolume
				this.modelMeta.fitsBed = meta.bbox.x <= bx && meta.bbox.y <= by
			}
		},

		clearModel() {
			this.model = {
				file: null,
				sliceFile: null,
				name: '',
				size: 0,
				source: null,
				fileId: null,
				davPath: '',
				convertError: '',
				convertedFrom3mf: false,
			}
			this.modelMeta = { bbox: null, fitsBed: true, triangleCount: 0, parseError: '', previewSkipped: false }
			this.meshState = defaultMeshState()
			this.resetMeshHealth()
			this.threeMfBuildItems = []
			this.threeMfSelectedIds = []
			this._persistMeshTransform()
		},

		_rememberRecentModel(file, source, meta = {}) {
			if (!file?.name) {
				return
			}
			const prefs = loadPrefs()
			const recent = Array.isArray(prefs.recentModels) ? [...prefs.recentModels] : []
			const entry = {
				name: file.name,
				size: file.size || 0,
				source: source || 'import',
				fileId: meta.file_id ?? meta.fileId ?? null,
				davPath: meta.dav_path ?? meta.davPath ?? '',
				at: new Date().toISOString(),
			}
			const filtered = recent.filter(r => r.name !== entry.name || r.davPath !== entry.davPath)
			filtered.unshift(entry)
			savePrefs({ recentModels: filtered.slice(0, RECENT_MODELS_MAX) })

			const withRefs = loadRecentModels().filter(r =>
				r.fileId !== entry.fileId || r.davPath !== entry.davPath || r.name !== entry.name)
			persistRecentModels([{
				name: entry.name,
				fileId: entry.fileId,
				davPath: entry.davPath,
				timestamp: Date.now(),
			}, ...withRefs])
		},

		_persistMeshTransform() {
			savePrefs({
				meshTransform: {
					position: this.meshState.position,
					rotation: this.meshState.rotation,
					scale: this.meshState.scale,
					dirty: this.meshState.dirty,
					autoApply: this.meshState.autoApply,
					modelName: this.model.name || '',
				},
			})
		},

		_persistOverrides() {
			savePrefs({ overrides: { ...this.overrides } })
		},

		/**
		 * Seed the nozzle/bed temperature overrides from a material reference
		 * entry (MaterialInfoPanel "use these temps"). Expands the override
		 * section so the change is visible, and persists.
		 * @param {{ nozzle_temp?: { recommended?: number }, bed_temp?: { recommended?: number } }} material
		 * @returns {boolean} whether any field was set
		 */
		applyMaterialTemps(material) {
			if (!material || typeof material !== 'object') {
				return false
			}
			const nozzle = material.nozzle_temp?.recommended
			const bed = material.bed_temp?.recommended
			let changed = false
			if (Number.isFinite(nozzle)) {
				this.overrides.nozzleTemp = nozzle
				changed = true
			}
			if (Number.isFinite(bed)) {
				this.overrides.bedTemp = bed
				changed = true
			}
			if (changed) {
				this.overridesCollapsed = false
				this._persistOverrides()
			}
			return changed
		},

		/**
		 * Smart-ETA: ask the backend for a learned slicer-vs-actual adjusted
		 * estimate for the current slice. Best-effort — failures are swallowed so
		 * the slice result still renders. Populates `etaPrediction`.
		 */
		async predictEta() {
			const slicerMinutes = (this.sliceJob.estimatedTimeS || 0) / 60
			if (slicerMinutes <= 0) {
				this.etaPrediction = null
				return null
			}
			try {
				const pred = await predictEtaApi({
					slicerMinutes,
					printerId: this.selection.printerId || this.selectedPrinterId || '',
					material: this._currentFilamentType(),
					nozzleDiameter: this._currentNozzleDiameter(),
				})
				// Only surface a correction once the bucket has learned something.
				this.etaPrediction = (pred && pred.samples > 0) ? pred : null
				return this.etaPrediction
			} catch (e) {
				this.etaPrediction = null
				return null
			}
		},

		/**
		 * Smart-ETA: record a finished print (slicer estimate vs actual duration)
		 * so the printer/material/nozzle bucket learns. Best-effort.
		 * @param {number} actualSeconds
		 */
		async recordEta(actualSeconds) {
			const slicerMinutes = (this.sliceJob.estimatedTimeS || 0) / 60
			const actualMinutes = (actualSeconds || 0) / 60
			if (slicerMinutes <= 0 || actualMinutes <= 0) {
				return null
			}
			try {
				return await recordEtaApi({
					slicerMinutes,
					actualMinutes,
					printerId: this.selection.printerId || this.selectedPrinterId || '',
					material: this._currentFilamentType(),
					nozzleDiameter: this._currentNozzleDiameter(),
				})
			} catch (e) {
				return null
			}
		},

		_currentFilamentType() {
			const fil = findById(this.profiles.filaments, this.selection.filamentId)
			return fil?.type || fil?.name || ''
		},

		_currentNozzleDiameter() {
			const printer = findById(this.profiles.printers, this.selection.printerId)
			const d = printer?.nozzle_diameter ?? printer?.nozzleDiameter
			return Number.isFinite(+d) && +d > 0 ? +d : 0.4
		},

		async loadConfig() {
			try {
				this.config = await fetchConfig()
				this.savedPresets = loadPresets()
				const def = this.configuredPrinters.find(p => p.default) || this.configuredPrinters[0]
				if (!this.selectedPrinterId && def?.id) {
					this.selectedPrinterId = def.id
				}
			} catch (e) {
				console.warn('[nc_print] config load failed:', e?.message || e)
				this.config = {}
			}
		},

		async loadAppStatus() {
			try {
				const data = await fetchAppStatus()
				this.appStatus = { ...data, loaded: true }
			} catch (e) {
				this.appStatus.loaded = true
				this.appStatus.slicer_ok = false
				this.appStatus.moonraker_ok = false
				this.appStatus.slicer_error = e?.message || 'status_failed'
			}
		},

		startStatusPolling(intervalMs = 30000) {
			this.stopStatusPolling()
			void this.loadAppStatus()
			this._statusTimer = setInterval(() => this.loadAppStatus(), intervalMs)
		},

		stopStatusPolling() {
			if (this._statusTimer) {
				clearInterval(this._statusTimer)
				this._statusTimer = null
			}
		},

		applyProfileDefaults() {
			const merged = mergeProfileSettings(this.profiles, this.selection)
			this.overrides = mergedToOverrideForm(merged)
		},

		onProfileChange() {
			this.applyProfileDefaults()
			const count = this.extruderCount
			if (!this.selection.filamentIds?.length) {
				this.selection.filamentIds = resolveFilamentIds(this.selection, count)
			}
			savePrefs({
				printerId: this.selection.printerId,
				filamentId: this.selection.filamentId,
				processId: this.selection.processId,
				selectedPrinterId: this.selectedPrinterId,
			})
		},

		onPrinterTargetChange() {
			savePrefs({ selectedPrinterId: this.selectedPrinterId })
			this.recordPrinterUsage(this.selectedPrinterId)
			this.stopPrinterPolling()
			this.startPrinterPolling()
			void this.fetchPrinterCapabilities(this.selectedPrinterId)
		},

		/**
		 * Live-detect the given printer's capabilities from Moonraker and cache
		 * them for the session. Best-effort; a failed/unreachable probe caches
		 * null so we don't keep re-querying every selection. Re-fetch with
		 * force=true.
		 * @param {string} id
		 * @param {boolean} [force]
		 */
		async fetchPrinterCapabilities(id, force = false) {
			const key = String(id || this.activeTargetPrinter?.id || '')
			if (!key) {
				return null
			}
			if (!force && Object.prototype.hasOwnProperty.call(this.printerCapabilities, key)) {
				return this.printerCapabilities[key]
			}
			try {
				const caps = await fetchCapabilitiesApi(key)
				this.printerCapabilities = { ...this.printerCapabilities, [key]: caps }
				return caps
			} catch (e) {
				this.printerCapabilities = { ...this.printerCapabilities, [key]: null }
				return null
			}
		},

		/**
		 * Record a target-printer selection into the recently-used MRU (most
		 * recent first, deduped, capped). Persisted per-browser.
		 * @param {string} id
		 */
		recordPrinterUsage(id) {
			if (!id) {
				return
			}
			const printer = findById(this.configuredPrinters, id)
			const name = printer?.name || String(id)
			const at = Date.now()
			const next = [{ id: String(id), name, at }]
			for (const r of this.recentPrinters) {
				if (String(r.id) !== String(id) && next.length < RECENT_PRINTERS_MAX) {
					next.push(r)
				}
			}
			this.recentPrinters = next
			persistRecentPrinters(next)
		},

		/**
		 * On-demand LAN scan for Moonraker printers. Populates
		 * discoveredPrinters (session-only). Best-effort with a visible error.
		 * @param {object} [opts] { hosts, subnet }
		 */
		async discoverPrinters(opts = {}) {
			this.discovering = true
			this.discoverError = ''
			try {
				const found = await discoverPrintersApi(opts)
				// Derive a stable id + display name for the picker.
				this.discoveredPrinters = found.map((f) => ({
					...f,
					id: 'found:' + (f.host || f.moonraker_url),
					name: f.hostname || f.host || f.moonraker_url,
				}))
				return this.discoveredPrinters
			} catch (e) {
				this.discoverError = e?.response?.data?.message || e?.message || 'Scan failed'
				return []
			} finally {
				this.discovering = false
			}
		},

		/**
		 * Add a discovered printer to the in-session configured list and select
		 * it. This does NOT persist to admin config (that stays an admin action)
		 * — it makes the printer usable now and remembers it via recent. Returns
		 * the added printer's id.
		 * @param {object} found a discoveredPrinters entry
		 */
		addDiscoveredPrinter(found) {
			if (!found?.moonraker_url) {
				return null
			}
			const id = found.id || ('found:' + found.host)
			const printer = {
				id,
				name: found.name || found.hostname || found.host,
				moonraker_url: found.moonraker_url,
				camera_url: '',
				default: false,
				_discovered: true,
			}
			// Merge into config.multi_printers (in-memory) so configuredPrinters
			// picks it up, unless an entry with the same URL already exists.
			const rows = Array.isArray(this.config?.multi_printers)
				? [...this.config.multi_printers]
				: [...this.configuredPrinters]
			const url = String(found.moonraker_url).toLowerCase()
			const existing = rows.find(p => String(p.moonraker_url || '').toLowerCase() === url)
			const targetId = existing ? existing.id : id
			if (!existing) {
				rows.push(printer)
				this.config = { ...(this.config || {}), multi_printers: rows }
			}
			// Remove from the discovered list now that it's configured.
			this.discoveredPrinters = this.discoveredPrinters.filter(
				d => String(d.moonraker_url || '').toLowerCase() !== url,
			)
			this.selectedPrinterId = targetId
			this.onPrinterTargetChange()
			return targetId
		},

		saveOverridePreset(name) {
			const label = (name || '').trim()
			if (!label) {
				toastError('Enter a preset name')
				return false
			}
			const all = { ...loadPresets(), [label]: { ...this.overrides } }
			savePresets(all)
			this.savedPresets = all
			toastSuccess(`Preset "${label}" saved`)
			return true
		},

		loadOverridePreset(name) {
			const preset = this.savedPresets[name] || loadPresets()[name]
			if (!preset) {
				toastError('Preset not found')
				return false
			}
			this.overrides = { ...this.overrides, ...preset }
			this._persistOverrides()
			toastInfo(`Loaded preset "${name}"`)
			return true
		},

		setMeshAutoApply(enabled) {
			this.meshState.autoApply = !!enabled
			this._persistMeshTransform()
		},

		restorePrefs() {
			const prefs = loadPrefs()
			if (prefs.printerId) {
				this.selection.printerId = prefs.printerId
			}
			if (prefs.filamentId) {
				this.selection.filamentId = prefs.filamentId
			}
			if (prefs.processId) {
				this.selection.processId = prefs.processId
			}
			if (prefs.selectedPrinterId) {
				this.selectedPrinterId = prefs.selectedPrinterId
			}
			if (typeof prefs.overridesCollapsed === 'boolean') {
				this.overridesCollapsed = prefs.overridesCollapsed
			}
			if (prefs.overrides && typeof prefs.overrides === 'object') {
				this.overrides = { ...this.overrides, ...prefs.overrides }
			}
			if (prefs.meshTransform && typeof prefs.meshTransform === 'object') {
				const mt = prefs.meshTransform
				if (Array.isArray(mt.position)) {
					this.meshState.position = [...mt.position]
				}
				if (Array.isArray(mt.rotation)) {
					this.meshState.rotation = [...mt.rotation]
				}
				if (Array.isArray(mt.scale)) {
					this.meshState.scale = [...mt.scale]
				}
				if (typeof mt.autoApply === 'boolean') {
					this.meshState.autoApply = mt.autoApply
				} else {
					this.meshState.autoApply = true
				}
				if (typeof mt.dirty === 'boolean' && mt.modelName === this.model.name) {
					this.meshState.dirty = mt.dirty
				}
			}
		},

		async loadProfiles() {
			try {
				const all = await fetchProfiles('all')
				this.profiles.printers = all.filter(p => p.kind === 'printer')
				this.profiles.filaments = all.filter(p => p.kind === 'filament')
				this.profiles.processes = all.filter(p => p.kind === 'process')
				this.profiles.loaded = true
				this.profiles.error = ''

				if (!this.selection.printerId) {
					this.selection.printerId = pickDefaultProfileId(this.profiles, 'printer')
				}
				if (!this.selection.filamentId) {
					this.selection.filamentId = pickDefaultProfileId(this.profiles, 'filament')
				}
				if (!this.selection.processId) {
					this.selection.processId = pickDefaultProfileId(this.profiles, 'process')
				}
				this.restorePrefs()
				this.applyProfileDefaults()
				this.selection.filamentIds = resolveFilamentIds(this.selection, this.extruderCount)
			} catch (e) {
				this.profiles.error = e?.message || 'Profile load failed'
				toastError('Could not load slicer profiles', e)
			}
		},

		async refreshPrinterState() {
			try {
				const data = await fetchState(this.selectedPrinterId || undefined)
				this._applyPrinterState(mapPrinterState(data))
			} catch (e) {
				this.printerState.connected = false
				this.printerState.state = 'offline'
				this.printerState.lastError = e?.message || 'Printer poll failed'
				console.debug('[nc_print] refreshPrinterState failed:', e?.message || e)
			}
		},

		_applyPrinterState(next) {
			const prevState = (this.printerState.state || '').toLowerCase()
			this.printerState = { ...this.printerState, ...next }
			this._maybeNotifyPrintTransition(prevState, (next.state || '').toLowerCase())
		},

		async requestPrintNotifications() {
			if (typeof Notification === 'undefined') {
				return 'unsupported'
			}
			if (Notification.permission === 'granted') {
				return 'granted'
			}
			if (Notification.permission === 'denied') {
				return 'denied'
			}
			try {
				localStorage.setItem(NOTIF_PROMPT_KEY, '1')
			} catch {
				// ignore
			}
			const result = await Notification.requestPermission()
			return result
		},

		notifyPrintComplete(filename) {
			if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
				return
			}
			const label = filename || this.printerState.filename || 'Print job'
			try {
				new Notification('Print complete', {
					body: `${label} finished successfully.`,
					tag: 'nc-print-complete',
				})
			} catch {
				// ignore
			}
		},

		notifyPrintFailed(message) {
			if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
				return
			}
			try {
				new Notification('Print failed', {
					body: message || this.printerState.message || 'The printer reported an error.',
					tag: 'nc-print-failed',
				})
			} catch {
				// ignore
			}
		},

		_maybeNotifyPrintTransition(prevState, nextState) {
			if (!nextState || prevState === nextState) {
				return
			}
			const key = `${prevState}->${nextState}:${this.printerState.filename || ''}`
			if (this._lastNotifiedPrintState === key) {
				return
			}
			if (nextState === 'complete' && ['printing', 'paused'].includes(prevState)) {
				this._lastNotifiedPrintState = key
				this.notifyPrintComplete(this.printerState.filename)
				toastSuccess('Print complete')
				// Feed the smart-ETA learner the slicer-vs-actual pair (best-effort).
				this.recordEta(this.printerState.totalDuration ?? this.printerState.printDuration)
			} else if (nextState === 'error' && ['printing', 'paused'].includes(prevState)) {
				this._lastNotifiedPrintState = key
				this.notifyPrintFailed(this.printerState.message)
				toastError('Print failed', new Error(this.printerState.message || 'Printer error'))
			}
		},

		startPrinterPolling(intervalMs = 5000) {
			this.stopPrinterPolling()
			const printer = this.activeTargetPrinter
			this._wsClient = new MoonrakerWsClient({
				onState: (data) => {
					this._applyPrinterState(mapPrinterState(data, data.lastError))
					this.printerProgressSource = this._wsClient?.usingWebSocket ? 'ws' : 'poll'
				},
				onGcodeResponse: (line) => {
					this.appendConsoleLine(line, 'response')
				},
			})
			void this._wsClient.start({
				printer,
				printerId: this.selectedPrinterId || printer?.id,
			})
			// Slow fallback poll when WS is active (health check)
			this._pollTimer = setInterval(() => {
				if (!this._wsClient?.usingWebSocket) {
					void this.refreshPrinterState()
				}
			}, intervalMs)
		},

		// WS11: append a line to the console scrollback (capped at 500 rows).
		appendConsoleLine(text, kind = 'response') {
			if (typeof text !== 'string' || text === '') {
				return
			}
			this.consoleLog.push({ id: `${Date.now()}-${this.consoleLog.length}`, kind, text })
			if (this.consoleLog.length > 500) {
				this.consoleLog.splice(0, this.consoleLog.length - 500)
			}
		},

		clearConsoleLog() {
			this.consoleLog = []
		},

		// WS11: send an arbitrary console command (server rejects unless the
		// admin enabled the console). Echoes the command locally first.
		async sendConsoleCommand(command) {
			const cmd = String(command || '').trim()
			if (!cmd) {
				return
			}
			this.appendConsoleLine(`> ${cmd}`, 'command')
			try {
				const { consoleCommand } = await import('@/services/moonraker-api.js')
				await consoleCommand(cmd, this.selectedPrinterId || undefined)
			} catch (e) {
				const msg = e?.response?.data?.message || e?.message || 'Console command failed'
				this.appendConsoleLine(`!! ${msg}`, 'error')
				throw e
			}
		},

		stopPrinterPolling() {
			if (this._wsClient) {
				this._wsClient.stop()
				this._wsClient = null
			}
			if (this._pollTimer) {
				clearInterval(this._pollTimer)
				this._pollTimer = null
			}
			this.printerProgressSource = 'poll'
		},

		resetSliceJob() {
			this.sliceJob = {
				status: 'idle',
				stage: '',
				pct: 0,
				layer: 0,
				totalLayers: 0,
				jobId: null,
				gcodeBlob: null,
				gcodeFilename: '',
				gcodeSizeBytes: 0,
				estimatedTimeS: 0,
				filamentUsedG: 0,
				filamentBreakdown: [],
				layers: 0,
				materialStats: {},
				savedDavPath: '',
				backendLabel: 'forge-slicer',
				sentTo: '',
				printing: false,
				error: '',
			}
		},

		_applyMaterialStats(done = {}) {
			if (done.material_stats && typeof done.material_stats === 'object') {
				const s = done.material_stats
				this.sliceJob.materialStats = {
					modelFilamentG: s.model_filament_g ?? s.modelFilamentG ?? null,
					supportFilamentG: s.support_filament_g ?? s.supportFilamentG ?? null,
					supportFilamentUsedG: s.support_filament_used_g ?? null,
					supportTimeS: s.support_time_s ?? s.supportTimeS ?? null,
				}
				return
			}
			this.sliceJob.materialStats = {
				modelFilamentG: done.model_filament_g ?? null,
				supportFilamentG: done.support_filament_g ?? null,
				supportFilamentUsedG: done.support_filament_used_g ?? null,
				supportTimeS: done.support_time_s ?? null,
			}
		},

		_recordJobHistory({ andSend = false } = {}) {
			const row = {
				id: `${Date.now()}-${this.sliceJob.jobId || 'local'}`,
				timestamp: Date.now(),
				modelName: this.model.name,
				fileId: this.model.fileId,
				davPath: this.model.davPath,
				printerId: this.selection.printerId,
				filamentId: this.selection.filamentId,
				processId: this.selection.processId,
				jobId: this.sliceJob.jobId,
				estimatedTimeS: this.sliceJob.estimatedTimeS,
				gcodeFilename: this.sliceJob.gcodeFilename,
				hasGcode: !!this.sliceJob.gcodeBlob,
				sentToPrinter: andSend,
			}
			this.jobHistory = [row, ...this.jobHistory.filter(r => r.id !== row.id)].slice(0, JOB_HISTORY_MAX)
			persistJobHistory(this.jobHistory)
		},

		async runSlice({ signal, andSend = false } = {}) {
			if (!this.model.file) {
				throw new Error('No model loaded')
			}
			if (!this.slicerReady) {
				toastWarning('Slicer service is offline — check Admin settings')
				throw new Error('Slicer offline')
			}
			this.resetSliceJob()
			this.sliceJob.status = 'running'

			const overrides = buildSliceOverrides(this.overrides)
			const filamentIds = resolveFilamentIds(this.selection, this.extruderCount)
			let jobIdForCancel = null

			try {
				const sliceFile = this.sliceModelFile()
				if (!sliceFile) {
					throw new Error(this.model.convertError || 'No slice-ready model file')
				}
				const done = await sliceStream({
					model: sliceFile,
					filename: sliceFile.name || this.model.name,
					printerId: this.selection.printerId,
					filamentIds,
					processId: this.selection.processId,
					overrides,
					pauses: this.pauses,
					signal,
					onEvent: ({ event, parsed }) => {
						if (event === 'progress' && parsed) {
							this.sliceJob.stage = parsed.stage || ''
							this.sliceJob.pct = parsed.pct ?? 0
							if (parsed.job_id) {
								jobIdForCancel = parsed.job_id
								this.sliceJob.jobId = parsed.job_id
							}
						}
						if (event === 'layer' && parsed) {
							this.sliceJob.layer = parsed.layer ?? 0
							this.sliceJob.totalLayers = parsed.total_layers ?? 0
						}
						if (event === 'done' && parsed?.job_id) {
							jobIdForCancel = parsed.job_id
						}
					},
				})

				this.sliceJob.jobId = done.job_id || done.jobId || jobIdForCancel
				if (this.sliceJob.jobId) {
					savePrefs({ lastJobId: this.sliceJob.jobId })
				}
				this.sliceJob.estimatedTimeS = done.estimated_time_s || 0
				this.sliceJob.filamentBreakdown = done.filament_used_g || []
				this.sliceJob.filamentUsedG = (done.filament_used_g || []).reduce((a, b) => a + b, 0)
				this.sliceJob.layers = done.total_layers || this.sliceJob.totalLayers || 0
				this._applyMaterialStats(done)
				this.sliceJob.backendLabel = 'forge-slicer'

				const stem = (this.model.name || 'model').replace(/\.[^.]+$/, '')
				this.sliceJob.gcodeFilename = `${stem}.gcode`
				this.sliceJob.status = 'done'
				this.predictEta()

				if (this.sliceJob.jobId) {
					try {
						this.sliceJob.gcodeBlob = await downloadGcode(this.sliceJob.jobId)
						this.sliceJob.gcodeSizeBytes = this.sliceJob.gcodeBlob?.size || 0
						this.sliceJob.error = ''
					} catch (downloadErr) {
						this.sliceJob.gcodeBlob = null
						this.sliceJob.gcodeSizeBytes = 0
						this.sliceJob.error = 'Slice finished but G-code download failed — retry download'
						toastWarning(this.sliceJob.error)
					}
				}

				if (this.sliceJob.error) {
					// download warning already toasted
				} else if (done.stream_incomplete) {
					toastWarning('Slice finished but the progress stream dropped early — G-code recovered from the slicer job.')
				} else {
					toastSuccess('Slice complete')
				}

				if (andSend && this.sliceJob.gcodeBlob) {
					await this.sendGcodeToPrinter(this.sliceJob.gcodeBlob, this.sliceJob.gcodeFilename, true)
				}

				this._recordJobHistory({ andSend })

				return done
			} catch (e) {
				if (e?.name === 'AbortError') {
					this.sliceJob.status = 'idle'
					this.sliceJob.error = 'Cancelled'
					toastInfo('Slicing cancelled')
					if (this.sliceJob.jobId || jobIdForCancel) {
						void cancelSliceJob(this.sliceJob.jobId || jobIdForCancel)
					}
					throw e
				}
				this.sliceJob.status = 'error'
				this.sliceJob.error = e?.message || String(e)
				// Clear stale progress so a retry doesn't briefly flash the
				// previous attempt's percentage/stage.
				this.sliceJob.pct = 0
				this.sliceJob.stage = ''
				toastError('Slice failed', e)
				throw e
			}
		},

		/**
		 * Apply the `done` payload from an arranged multi-model slice
		 * (sliceStreamMulti) into sliceJob so the result panel, 3D preview, and
		 * Send-to-printer flow all work exactly like a single-model slice.
		 * @param {object} done
		 */
		async applyArrangedSliceResult(done = {}) {
			this.sliceJob.jobId = done.job_id || done.jobId || null
			this.sliceJob.estimatedTimeS = done.estimated_time_s || 0
			this.sliceJob.filamentBreakdown = done.filament_used_g || []
			this.sliceJob.filamentUsedG = (done.filament_used_g || []).reduce((a, b) => a + b, 0)
			this._applyMaterialStats(done)
			this.sliceJob.backendLabel = 'nc-print-slicer (arranged)'
			const stem = (this.model.name || 'plate').replace(/\.[^.]+$/, '')
			this.sliceJob.gcodeFilename = `${stem}-plate.gcode`
			this.sliceJob.status = 'done'
			this.predictEta()
			if (this.sliceJob.jobId) {
				try {
					this.sliceJob.gcodeBlob = await downloadGcode(this.sliceJob.jobId)
					this.sliceJob.gcodeSizeBytes = this.sliceJob.gcodeBlob?.size || 0
					this.sliceJob.error = ''
					toastSuccess('Arranged slice complete')
				} catch (e) {
					this.sliceJob.gcodeBlob = null
					this.sliceJob.error = 'Arranged slice finished but G-code download failed'
					toastWarning(this.sliceJob.error)
				}
			}
			return done
		},

		async sendGcodeToPrinter(gcodeBlob, filename, start = false) {
			const targetId = this.selectedPrinterId || this.activeTargetPrinter?.id
			await moonrakerUpload(gcodeBlob, filename, start, targetId)
			const name = this.activeTargetPrinter?.name
				|| this.appStatus.printer_display_name
				|| this.config?.printer_display_name
				|| 'printer'
			this.sliceJob.sentTo = name
			this.sliceJob.printing = start
			toastSuccess(start ? `Print started on ${name}` : `G-code uploaded to ${name}`)
			await this.refreshPrinterState()
			if (start) {
				this.activeTab = TABS.PRINT
			}
		},

		async sliceOnly({ signal } = {}) {
			return this.runSlice({ signal, andSend: false })
		},

		requestPrePrintConfirm() {
			return new Promise((resolve) => {
				this.prePrintModal = { visible: true, resolve }
			})
		},

		confirmPrePrint() {
			const { resolve } = this.prePrintModal
			this.prePrintModal = { visible: false, resolve: null }
			if (resolve) {
				resolve(true)
			}
		},

		cancelPrePrint() {
			const { resolve } = this.prePrintModal
			this.prePrintModal = { visible: false, resolve: null }
			if (resolve) {
				resolve(false)
			}
		},

		async sliceAndSend({ signal } = {}) {
			const confirmed = await this.requestPrePrintConfirm()
			if (!confirmed) {
				return null
			}
			return this.runSlice({ signal, andSend: true })
		},

		cancelSlice(abortController) {
			if (abortController) {
				abortController.abort()
			}
			if (this.sliceJob.jobId) {
				void cancelSliceJob(this.sliceJob.jobId)
			}
		},

		async retryDownloadGcode() {
			if (!this.sliceJob.jobId) {
				toastError('No slice job to download from')
				return false
			}
			try {
				this.sliceJob.gcodeBlob = await downloadGcode(this.sliceJob.jobId)
				this.sliceJob.gcodeSizeBytes = this.sliceJob.gcodeBlob?.size || 0
				this.sliceJob.error = ''
				toastSuccess('G-code downloaded')
				return true
			} catch (e) {
				this.sliceJob.error = 'Slice finished but G-code download failed — retry download'
				toastWarning(this.sliceJob.error)
				return false
			}
		},

		downloadGcodeLocal() {
			if (!this.sliceJob.gcodeBlob) {
				return
			}
			const url = URL.createObjectURL(this.sliceJob.gcodeBlob)
			const a = document.createElement('a')
			a.href = url
			a.download = this.sliceJob.gcodeFilename || 'model.gcode'
			a.click()
			URL.revokeObjectURL(url)
		},

		async loadFileFromNextcloud({ dav_path, file_id } = {}) {
			try {
				const meta = await resolveFile({ dav_path, file_id })
				const blob = await fetchModelBlob({ dav_path, file_id })
				const name = meta?.basename || dav_path?.split('/').pop() || 'model.stl'
				return this.setModel(
					new File([blob], name, { type: blob.type }),
					'files',
					{ file_id: meta?.file_id ?? file_id, dav_path: meta?.dav_path ?? dav_path },
				)
			} catch (e) {
				toastError('Could not load file from Nextcloud', e)
				return false
			}
		},

		async loadRecentModel(entry) {
			if (!entry) {
				return false
			}
			if (entry.fileId || entry.davPath) {
				return this.loadFileFromNextcloud({ file_id: entry.fileId, dav_path: entry.davPath })
			}
			toastWarning('This recent model has no Files reference — pick it again from Nextcloud')
			return false
		},

		async saveGcodeToFiles() {
			if (!this.sliceJob.gcodeBlob) {
				toastError('No G-code to save')
				return false
			}
			if (!this.model.fileId && !this.model.davPath) {
				toastWarning('Load the model from Nextcloud Files to save G-code beside it')
				return false
			}
			this.savingGcode = true
			try {
				const result = await saveGcodeApi({
					file_id: this.model.fileId || undefined,
					dav_path: this.model.davPath || undefined,
					gcodeBlob: this.sliceJob.gcodeBlob,
					filename: this.sliceJob.gcodeFilename,
				})
				this.sliceJob.savedDavPath = result?.dav_path || ''
				toastSuccess(`G-code saved to ${result?.basename || 'Files'}`)
				return true
			} catch (e) {
				toastError('Save to Files failed', e)
				return false
			} finally {
				this.savingGcode = false
			}
		},

		async replayJobSlice(row) {
			if (row?.fileId || row?.davPath) {
				await this.loadFileFromNextcloud({ file_id: row.fileId, dav_path: row.davPath })
			}
			if (row?.printerId) {
				this.selection.printerId = row.printerId
			}
			if (row?.filamentId) {
				this.selection.filamentId = row.filamentId
			}
			if (row?.processId) {
				this.selection.processId = row.processId
			}
			this.applyProfileDefaults()
			this.setActiveTab(TABS.SLICE)
		},

		async replayJobPrint(row) {
			if (row?.jobId && !this.sliceJob.gcodeBlob) {
				this.sliceJob.jobId = row.jobId
				await this.retryDownloadGcode()
			}
			if (this.sliceJob.gcodeBlob) {
				await this.sendGcodeToPrinter(
					this.sliceJob.gcodeBlob,
					row?.gcodeFilename || this.sliceJob.gcodeFilename,
					true,
				)
				return
			}
			toastWarning('G-code no longer available — slice again first')
		},

		clearPendingPrintUpload() {
			this.pendingPrintUpload = null
		},

		async bootstrapDeepLink() {
			const b = this.bootstrap
			if (!b) {
				return
			}

			const openTab = b.open_tab
			if (openTab && Object.values(TABS).includes(openTab)) {
				this.activeTab = openTab
			}

			const fileId = b.file_id
			if (!fileId) {
				return
			}

			if (openTab === TABS.PRINT) {
				try {
					const meta = await resolveFile({ file_id: fileId, allow_gcode: true })
					const blob = await fetchModelBlob({ file_id: fileId, allow_gcode: true })
					const name = meta?.basename || meta?.name || `job-${fileId}.gcode`
					this.pendingPrintUpload = { blob, filename: name }
					this.activeTab = TABS.PRINT
				} catch (e) {
					toastError('Could not load G-code from Nextcloud', e)
				}
				return
			}

			await this.loadFileFromNextcloud({ file_id: fileId })
		},

		toggleOverridesCollapsed() {
			this.overridesCollapsed = !this.overridesCollapsed
			savePrefs({ overridesCollapsed: this.overridesCollapsed })
		},

		persistOverrides() {
			this._persistOverrides()
		},

		// ── Pause / filament-change at height ──────────────────────────
		addPause({ height, type = 'filament_change' } = {}) {
			const h = Number(height)
			if (!Number.isFinite(h) || h <= 0) {
				return false
			}
			this.pauses = [...this.pauses, { height: h, type }]
				.sort((a, b) => a.height - b.height)
			return true
		},
		removePause(index) {
			if (index >= 0 && index < this.pauses.length) {
				this.pauses = this.pauses.filter((_, i) => i !== index)
			}
		},
		clearPauses() {
			this.pauses = []
		},
	},
})
