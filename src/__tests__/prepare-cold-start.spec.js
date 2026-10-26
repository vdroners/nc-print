import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/services/toast.js', () => ({
	toastError: vi.fn(), toastSuccess: vi.fn(), toastWarning: vi.fn(), toastInfo: vi.fn(),
}))
vi.mock('@/services/slicer-api.js', () => ({
	fetchProfiles: vi.fn(async () => []), sliceStream: vi.fn(), sliceStreamMulti: vi.fn(),
	downloadGcode: vi.fn(), uploadAndStart: vi.fn(), cancelSliceJob: vi.fn(),
}))
vi.mock('@/services/moonraker-api.js', () => ({ fetchState: vi.fn(async () => ({})), uploadAndStart: vi.fn() }))
vi.mock('@/services/config-api.js', () => ({ fetchConfig: vi.fn(async () => ({})) }))
vi.mock('@/services/status-api.js', () => ({ fetchAppStatus: vi.fn(async () => ({})) }))
vi.mock('@/services/files-api.js', () => ({ fetchModelBlob: vi.fn(), resolveFile: vi.fn() }))
vi.mock('@/services/gcode-save-api.js', () => ({ saveGcodeToFiles: vi.fn() }))
vi.mock('@/services/moonraker-ws.js', () => ({ MoonrakerWsClient: vi.fn() }))
vi.mock('@/services/mesh-convert.js', async (importOriginal) => {
	const actual = await importOriginal()
	return { ...actual, convert3mfToStlBuffer: vi.fn(), list3mfBuildItems: vi.fn(async () => []) }
})

import { usePrintStore } from '@/store/print.js'
import { TABS } from '@/constants/tabs.js'
import { isPrepareComplete, prepareChecklistProgress } from '@/utils/workflow-gates.js'
import {
	visiblePrepareChecklist,
	checklistRowTone,
	checklistRowMark,
	checklistRowClass,
} from '@/utils/prepare-checklist-ui.js'

const read = (rel) => readFileSync(path.resolve(rel), 'utf8')

function readyProfiles(store) {
	store.profiles.printers = [{ id: 'p', name: 'Creality K1' }]
	store.profiles.filaments = [{ id: 'f', name: 'PLA' }]
	store.profiles.processes = [{ id: 'q', name: '0.20mm Standard' }]
	store.selection.printerId = 'p'
	store.selection.filamentId = 'f'
	store.selection.processId = 'q'
}

describe('Prepare cold start', () => {
	beforeEach(() => {
		localStorage.clear()
		setActivePinia(createPinia())
	})

	it('Prepare subtitle is the model name or No model, not profiles and target', () => {
		const store = usePrintStore()
		readyProfiles(store)
		store.config = { multi_printers: [{ id: 'k1', name: '3D Printer' }] }
		store.selectedPrinterId = 'k1'
		store.printerState.state = 'offline'
		expect(store.workflowStepSubtitle(TABS.PREPARE)).toBe('No model')

		store.model.name = 'bracket.stl'
		store.model.file = {}
		const subtitle = store.workflowStepSubtitle(TABS.PREPARE)
		expect(subtitle).toBe('bracket.stl')
		expect(subtitle).not.toMatch(/[·→]/)
		expect(subtitle).not.toMatch(/Creality|PLA|0\.20mm/)
	})

	it('connection line names the printer and the failure when offline or in error', () => {
		const store = usePrintStore()
		expect(store.targetConnectionLabel).toBe('')

		store.config = { multi_printers: [{ id: 'k1', name: '3D Printer' }] }
		store.selectedPrinterId = 'k1'
		store.printerState.connected = false
		store.printerState.state = 'offline'
		store.printerState.message = 'Printer unreachable — check network or selection'
		store.printerState.lastError = ''
		expect(store.targetConnectionLabel).toBe(
			'3D Printer · offline · Printer unreachable — check network or selection',
		)
		expect(store.targetConnectionClass).toBe('is-offline')

		store.printerState.state = 'reconnecting'
		store.printerState.message = ''
		store.printerState.lastError = 'websocket closed'
		expect(store.targetConnectionLabel).toBe('3D Printer · reconnecting… · websocket closed')
		expect(store.targetConnectionClass).toBe('is-reconnecting')

		store.printerState.connected = true
		store.printerState.state = 'error'
		store.printerState.message = 'Klipper shutdown'
		store.printerState.lastError = ''
		expect(store.targetConnectionLabel).toBe('3D Printer · error · Klipper shutdown')
		expect(store.targetConnectionClass).toBe('is-error')

		store.printerState.state = 'printing'
		store.printerState.message = 'Door PA-CF'
		expect(store.targetConnectionLabel).toBe('3D Printer · printing')
		expect(store.targetConnectionClass).toBe('is-online')
	})

	it('empty Prepare hides mesh, preview, and watertight; advisory offline is not a red miss', () => {
		const store = usePrintStore()
		readyProfiles(store)
		store.config = { multi_printers: [{ id: 'k1', name: '3D Printer' }] }
		store.selectedPrinterId = 'k1'
		store.printerState.connected = false
		store.printerState.state = 'offline'
		store.printerState.message = 'Printer unreachable — check network or selection'
		store.appStatus = {
			...store.appStatus,
			loaded: true,
			slicer_enabled: true,
			slicer_ok: false,
		}

		const rows = visiblePrepareChecklist(store.prepareChecklist)
		const ids = rows.map((row) => row.id)
		expect(ids).not.toContain('mesh')
		expect(ids).not.toContain('preview')
		expect(ids).not.toContain('watertight')
		expect(ids).toEqual(expect.arrayContaining(['model', 'slicer', 'target_online']))

		expect(checklistRowTone(rows.find((row) => row.id === 'model'))).toBe('missing')
		expect(checklistRowTone(rows.find((row) => row.id === 'slicer'))).toBe('missing')
		expect(checklistRowMark(rows.find((row) => row.id === 'slicer'))).toBe('✗')

		const online = rows.find((row) => row.id === 'target_online')
		expect(online.advisory).toBe(true)
		expect(online.ok).toBe(false)
		expect(checklistRowTone(online)).toBe('advisory')
		expect(checklistRowMark(online)).toBe('!')
		expect(checklistRowMark(online)).not.toBe('✗')
		expect(checklistRowClass(online).join(' ')).toMatch(/row--advisory/)
		expect(checklistRowClass(online).join(' ')).not.toMatch(/row--missing/)
		expect(online.hint).toMatch(/unreachable/)
	})

	it('a loaded non-watertight mesh stays advisory and does not block slice', () => {
		const store = usePrintStore()
		readyProfiles(store)
		store.model.file = {}
		store.model.name = 'bracket.stl'
		store.meshHealth = { ...store.meshHealth, analyzed: true, watertight: false, openEdgeCount: 4 }
		store.appStatus = {
			...store.appStatus,
			loaded: true,
			slicer_enabled: true,
			slicer_ok: true,
		}

		const rows = visiblePrepareChecklist(store.prepareChecklist)
		expect(rows.map((row) => row.id)).toEqual(expect.arrayContaining(['mesh', 'preview', 'watertight']))
		const watertight = rows.find((row) => row.id === 'watertight')
		expect(checklistRowTone(watertight)).toBe('advisory')
		expect(checklistRowMark(watertight)).not.toBe('✗')

		const blocking = visiblePrepareChecklist(store.prepareChecklist, { blockingOnly: true })
		const blockingWt = blocking.find((row) => row.id === 'watertight')
		expect(blockingWt).toBeTruthy()
		expect(checklistRowTone(blockingWt)).toBe('advisory')
		expect(blocking.find((row) => row.id === 'model')).toBeUndefined()

		const state = {
			model: { file: {} },
			selection: { printerId: 'p', filamentId: 'f', processId: 'q' },
			appStatus: { loaded: true, slicer_enabled: true, slicer_ok: true },
			meshHealth: { analyzed: true, watertight: false },
		}
		expect(isPrepareComplete(state)).toBe(true)
		expect(prepareChecklistProgress(state)).toEqual({ ready: 7, total: 7 })
	})
})

describe('Prepare checklist advisory styling is wired', () => {
	const checklist = read('src/components/PrepareChecklist.vue')

	it('uses the shared tone helper and a warning mark, not the missing red', () => {
		expect(checklist).toMatch(/visiblePrepareChecklist/)
		expect(checklist).toMatch(/checklistRowClass/)
		expect(checklist).toMatch(/nc-print-checklist__row--advisory/)
		expect(checklist).toMatch(/--nc-gcs-warning/)
		expect(checklist).not.toMatch(/row\.ok \? 'nc-print-checklist__row--ok' : 'nc-print-checklist__row--missing'/)
	})
})
