import { defineStore } from 'pinia'
import { fetchProfiles, sliceStream, downloadGcode, uploadAndStart } from '@/services/slicer-api.js'
import { buildSliceOverrides } from '@/services/slicer-utils.js'
import { fetchState } from '@/services/moonraker-api.js'
import { fetchConfig } from '@/services/config-api.js'

export const TABS = {
	PREPARE: 'prepare',
	SLICE: 'slice',
	PRINT: 'print',
}

export const usePrintStore = defineStore('print', {
	state: () => ({
		activeTab: TABS.PREPARE,
		config: null,
		model: {
			file: null,
			name: '',
			size: 0,
			source: null, // 'import' | 'files' | 'drop'
		},
		profiles: {
			printers: [],
			filaments: [],
			processes: [],
			loaded: false,
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
		uploadAndStart: true,
		sliceJob: {
			status: 'idle', // idle | running | done | error
			stage: '',
			pct: 0,
			layer: 0,
			totalLayers: 0,
			jobId: null,
			gcodeBlob: null,
			gcodeFilename: '',
			estimatedTimeS: 0,
			filamentUsedG: 0,
			error: '',
		},
		printerState: {
			connected: false,
			state: 'unknown',
			message: '',
			progress: 0,
			extruderTemp: null,
			bedTemp: null,
		},
		_pollTimer: null,
	}),

	getters: {
		hasModel: (s) => !!s.model.file,
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
	},

	actions: {
		setActiveTab(tab) {
			if (Object.values(TABS).includes(tab)) {
				this.activeTab = tab
			}
		},

		setModel(file, source = 'import') {
			this.model = {
				file,
				name: file?.name || '',
				size: file?.size || 0,
				source,
			}
		},

		clearModel() {
			this.model = { file: null, name: '', size: 0, source: null }
		},

		async loadConfig() {
			try {
				this.config = await fetchConfig()
			} catch (e) {
				console.warn('[nc_print] config load failed:', e?.message || e)
				this.config = {}
			}
		},

		async loadProfiles() {
			try {
				const all = await fetchProfiles('all')
				this.profiles.printers = all.filter(p => p.kind === 'printer')
				this.profiles.filaments = all.filter(p => p.kind === 'filament')
				this.profiles.processes = all.filter(p => p.kind === 'process')
				this.profiles.loaded = true
				if (!this.selection.printerId && this.profiles.printers[0]) {
					this.selection.printerId = this.profiles.printers[0].id
				}
				if (!this.selection.filamentId && this.profiles.filaments[0]) {
					this.selection.filamentId = this.profiles.filaments[0].id
				}
				if (!this.selection.processId && this.profiles.processes[0]) {
					this.selection.processId = this.profiles.processes[0].id
				}
			} catch (e) {
				console.warn('[nc_print] profiles load failed:', e?.message || e)
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
				estimatedTimeS: 0,
				filamentUsedG: 0,
				error: '',
			}
		},

		async runSlice({ signal } = {}) {
			if (!this.model.file) {
				throw new Error('No model loaded')
			}
			this.resetSliceJob()
			this.sliceJob.status = 'running'

			const overrides = buildSliceOverrides(this.overrides)
			const filamentIds = this.selection.filamentId ? [this.selection.filamentId] : []

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
						}
						if (event === 'layer' && parsed) {
							this.sliceJob.layer = parsed.layer ?? 0
							this.sliceJob.totalLayers = parsed.total_layers ?? 0
						}
					},
				})

				this.sliceJob.jobId = done.job_id || done.jobId || null
				this.sliceJob.estimatedTimeS = done.estimated_time_s || 0
				this.sliceJob.filamentUsedG = (done.filament_used_g || []).reduce((a, b) => a + b, 0)

				if (this.sliceJob.jobId) {
					this.sliceJob.gcodeBlob = await downloadGcode(this.sliceJob.jobId)
				}
				const stem = (this.model.name || 'model').replace(/\.[^.]+$/, '')
				this.sliceJob.gcodeFilename = `${stem}.gcode`
				this.sliceJob.status = 'done'
				return done
			} catch (e) {
				this.sliceJob.status = 'error'
				this.sliceJob.error = e?.message || String(e)
				throw e
			}
		},

		async sliceAndMaybeStart({ signal } = {}) {
			await this.runSlice({ signal })
			if (this.uploadAndStart && this.sliceJob.gcodeBlob) {
				await uploadAndStart(
					this.sliceJob.gcodeBlob,
					this.sliceJob.gcodeFilename,
					true,
				)
				await this.refreshPrinterState()
				this.activeTab = TABS.PRINT
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
	},
})
