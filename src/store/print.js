import { defineStore } from 'pinia'
import { fetchProfiles, sliceStream, downloadGcode, uploadAndStart, cancelSliceJob } from '@/services/slicer-api.js'
import {
	buildSliceOverrides,
	mergeProfileSettings,
	mergedToOverrideForm,
	pickDefaultProfileId,
	parseStlMetadata,
} from '@/services/slicer-utils.js'
import { fetchState, uploadAndStart as moonrakerUpload } from '@/services/moonraker-api.js'
import { fetchConfig } from '@/services/config-api.js'
import { fetchAppStatus } from '@/services/status-api.js'
import { fetchModelBlob, resolveFile } from '@/services/files-api.js'
import { validateModelFile } from '@/shared/modelFileNode.js'
import { toastError, toastSuccess, toastWarning, toastInfo } from '@/services/toast.js'

export const TABS = {
	PREPARE: 'prepare',
	SLICE: 'slice',
	PRINT: 'print',
}

const PREFS_KEY = 'nc_print_prefs_v1'

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
			loaded: false,
		},
		model: {
			file: null,
			name: '',
			size: 0,
			source: null,
		},
		modelMeta: {
			bbox: null,
			fitsBed: true,
			triangleCount: 0,
			parseError: '',
			previewSkipped: false,
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
			processId: '',
		},
		overrides: {
			layerHeight: '',
			lineWidth: '',
			perimeters: '',
			infillDensity: '',
			printSpeed: '',
			firstLayerSpeed: '',
			nozzleTemp: '',
			bedTemp: '',
		},
		overridesCollapsed: true,
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
			backendLabel: 'forge-slicer',
			sentTo: '',
			printing: false,
			error: '',
		},
		printerState: {
			connected: false,
			state: 'unknown',
			message: '',
			progress: 0,
			extruderTemp: null,
			bedTemp: null,
			filename: null,
			printDuration: null,
			totalDuration: null,
		},
		pendingPrintUpload: null,
		_pollTimer: null,
		_statusTimer: null,
		_sliceAbort: null,
	}),

	getters: {
		hasModel: (s) => !!s.model.file,
		slicerReady: (s) => !s.appStatus.loaded || (s.appStatus.slicer_enabled && s.appStatus.slicer_ok),
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
				isActive: st === 'printing' || st === 'paused',
				canPause: st === 'printing',
				canResume: st === 'paused',
				canCancel: st === 'printing' || st === 'paused',
			}
		},
		prepareComplete(state) {
			return !!state.model.file && !!state.selection.printerId && !!state.selection.filamentId && !!state.selection.processId
		},
		sliceComplete(state) {
			return state.sliceJob.status === 'done'
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

		setModel(file, source = 'import') {
			const check = validateModelFile(file)
			if (!check.ok) {
				toastError(check.error)
				return false
			}
			this.model = {
				file,
				name: file?.name || '',
				size: file?.size || 0,
				source,
			}
			this._updateModelMetaFromFile(file)
			return true
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
			this.model = { file: null, name: '', size: 0, source: null }
			this.modelMeta = { bbox: null, fitsBed: true, triangleCount: 0, parseError: '', previewSkipped: false }
		},

		async loadConfig() {
			try {
				this.config = await fetchConfig()
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
			savePrefs({
				printerId: this.selection.printerId,
				filamentId: this.selection.filamentId,
				processId: this.selection.processId,
			})
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
			if (typeof prefs.overridesCollapsed === 'boolean') {
				this.overridesCollapsed = prefs.overridesCollapsed
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
			} catch (e) {
				this.profiles.error = e?.message || 'Profile load failed'
				toastError('Could not load slicer profiles', e)
			}
		},

		async refreshPrinterState() {
			try {
				const data = await fetchState()
				this.printerState = {
					connected: !!data.connected,
					state: data.state || data.status || 'unknown',
					message: data.message || '',
					progress: data.progress ?? 0,
					extruderTemp: data.extruder_temp ?? data.extruderTemp ?? null,
					bedTemp: data.bed_temp ?? data.bedTemp ?? null,
					filename: data.filename ?? null,
					printDuration: data.print_duration ?? data.printDuration ?? null,
					totalDuration: data.total_duration ?? data.totalDuration ?? null,
				}
			} catch {
				this.printerState.connected = false
				this.printerState.state = 'offline'
			}
		},

		startPrinterPolling(intervalMs = 5000) {
			this.stopPrinterPolling()
			void this.refreshPrinterState()
			this._pollTimer = setInterval(() => this.refreshPrinterState(), intervalMs)
		},

		stopPrinterPolling() {
			if (this._pollTimer) {
				clearInterval(this._pollTimer)
				this._pollTimer = null
			}
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
				backendLabel: 'forge-slicer',
				sentTo: '',
				printing: false,
				error: '',
			}
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
			const filamentIds = this.selection.filamentId ? [this.selection.filamentId] : []
			let jobIdForCancel = null

			try {
				const done = await sliceStream({
					model: this.model.file,
					filename: this.model.name,
					printerId: this.selection.printerId,
					filamentIds,
					processId: this.selection.processId,
					overrides,
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
				this.sliceJob.estimatedTimeS = done.estimated_time_s || 0
				this.sliceJob.filamentBreakdown = done.filament_used_g || []
				this.sliceJob.filamentUsedG = (done.filament_used_g || []).reduce((a, b) => a + b, 0)
				this.sliceJob.layers = done.total_layers || this.sliceJob.totalLayers || 0
				this.sliceJob.backendLabel = 'forge-slicer'

				if (this.sliceJob.jobId) {
					this.sliceJob.gcodeBlob = await downloadGcode(this.sliceJob.jobId)
					this.sliceJob.gcodeSizeBytes = this.sliceJob.gcodeBlob?.size || 0
				}
				const stem = (this.model.name || 'model').replace(/\.[^.]+$/, '')
				this.sliceJob.gcodeFilename = `${stem}.gcode`
				this.sliceJob.status = 'done'
				toastSuccess('Slice complete')

				if (andSend && this.sliceJob.gcodeBlob) {
					await this.sendGcodeToPrinter(this.sliceJob.gcodeBlob, this.sliceJob.gcodeFilename, true)
				}

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
				toastError('Slice failed', e)
				throw e
			}
		},

		async sendGcodeToPrinter(gcodeBlob, filename, start = false) {
			await moonrakerUpload(gcodeBlob, filename, start)
			const name = this.appStatus.printer_display_name || this.config?.printer_display_name || 'printer'
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

		async sliceAndSend({ signal } = {}) {
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
				const blob = await fetchModelBlob({ dav_path, file_id })
				const name = dav_path?.split('/').pop() || 'model.stl'
				return this.setModel(new File([blob], name, { type: blob.type }), 'files')
			} catch (e) {
				toastError('Could not load file from Nextcloud', e)
				return false
			}
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
	},
})
