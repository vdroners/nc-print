import { describe, it, expect, vi } from 'vitest'
import { buildCommands, PALETTE_PANELS } from '@/utils/commands.js'
import { TABS } from '@/constants/tabs.js'

/** Minimal mock store; override per test. */
function mockStore(over = {}) {
	return {
		prepareComplete: false,
		hasModel: false,
		sliceBlockReason: '',
		selectedPrinterId: '',
		configuredPrinters: [],
		printerState: { state: 'standby' },
		printerControls: { isActive: false, canPause: false, canResume: false, canCancel: false },
		setActiveTab: vi.fn(),
		sliceOnly: vi.fn(),
		sliceAndSend: vi.fn(),
		printPause: vi.fn(),
		printResume: vi.fn(),
		printCancel: vi.fn(),
		onPrinterTargetChange: vi.fn(),
		...over,
	}
}

function byId(cmds, id) {
	return cmds.find((c) => c.id === id)
}

describe('buildCommands', () => {
	it('always includes the three navigation commands', () => {
		const cmds = buildCommands(mockStore())
		expect(byId(cmds, 'nav-prepare')).toBeTruthy()
		expect(byId(cmds, 'nav-slice')).toBeTruthy()
		expect(byId(cmds, 'nav-print')).toBeTruthy()
	})

	it('gates Go to Slice on prepareComplete', () => {
		expect(byId(buildCommands(mockStore({ prepareComplete: false })), 'nav-slice').enabled).toBe(false)
		expect(byId(buildCommands(mockStore({ prepareComplete: true })), 'nav-slice').enabled).toBe(true)
	})

	it('nav command runs setActiveTab', () => {
		const store = mockStore()
		byId(buildCommands(store), 'nav-print').run()
		expect(store.setActiveTab).toHaveBeenCalledWith(TABS.PRINT)
	})

	it('Slice is enabled only with a model and no block reason', () => {
		expect(byId(buildCommands(mockStore({ hasModel: false })), 'act-slice').enabled).toBe(false)
		expect(byId(buildCommands(mockStore({ hasModel: true, sliceBlockReason: 'no printer' })), 'act-slice').enabled).toBe(false)
		expect(byId(buildCommands(mockStore({ hasModel: true, sliceBlockReason: '' })), 'act-slice').enabled).toBe(true)
	})

	it('Pause enabled only while actively printing', () => {
		const printing = mockStore({ printerControls: { isActive: true, canPause: true }, printerState: { state: 'printing' } })
		const idle = mockStore()
		expect(byId(buildCommands(printing), 'act-pause').enabled).toBe(true)
		expect(byId(buildCommands(idle), 'act-pause').enabled).toBe(false)
	})

	it('Resume enabled only when paused', () => {
		const paused = mockStore({ printerControls: { isActive: true, canResume: true }, printerState: { state: 'paused' } })
		expect(byId(buildCommands(paused), 'act-resume').enabled).toBe(true)
		expect(byId(buildCommands(paused), 'act-pause').enabled).toBe(false) // not while paused
	})

	it('pause command calls store.printPause', () => {
		const store = mockStore({ printerControls: { isActive: true, canPause: true }, printerState: { state: 'printing' } })
		byId(buildCommands(store), 'act-pause').run()
		expect(store.printPause).toHaveBeenCalled()
	})

	it('exposes an Open command per palette panel', () => {
		const store = mockStore()
		const focusPanel = vi.fn()
		const cmds = buildCommands(store, { focusPanel })
		for (const p of PALETTE_PANELS) {
			expect(byId(cmds, `panel-${p.id}`)).toBeTruthy()
		}
		byId(cmds, `panel-${PALETTE_PANELS[0].id}`).run()
		expect(store.setActiveTab).toHaveBeenCalledWith(TABS.PRINT)
		expect(focusPanel).toHaveBeenCalledWith(PALETTE_PANELS[0].id)
	})

	it('adds a switch command per configured printer, current one disabled', () => {
		const store = mockStore({
			selectedPrinterId: 'k1',
			configuredPrinters: [{ id: 'k1', name: 'K1' }, { id: 'k2', name: 'K2' }],
		})
		const cmds = buildCommands(store)
		expect(byId(cmds, 'printer-k1').enabled).toBe(false) // current
		expect(byId(cmds, 'printer-k2').enabled).toBe(true)
		byId(cmds, 'printer-k2').run()
		expect(store.selectedPrinterId).toBe('k2')
		expect(store.onPrinterTargetChange).toHaveBeenCalled()
	})

	it('import command only present when openImport is supplied', () => {
		expect(byId(buildCommands(mockStore()), 'act-import')).toBeUndefined()
		const withImport = buildCommands(mockStore(), { openImport: vi.fn() })
		expect(byId(withImport, 'act-import')).toBeTruthy()
	})
})
