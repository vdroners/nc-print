/**
 * Last-seen Moonraker snapshot when the link flaps.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
	formatLastSeen,
	snapshotFromPrinterState,
	staleJobView,
} from '@/utils/link-loss.js'

vi.mock('@nextcloud/router', () => ({ generateUrl: (p) => `https://cloud.example${p}` }))
vi.mock('@nextcloud/axios', () => ({ default: { post: vi.fn(), get: vi.fn(), delete: vi.fn() } }))
vi.mock('@/services/toast.js', () => ({
	toastError: vi.fn(), toastSuccess: vi.fn(), toastWarning: vi.fn(), toastInfo: vi.fn(),
}))
vi.mock('@/services/slicer-api.js', () => ({
	fetchProfiles: vi.fn(async () => []), sliceStream: vi.fn(), downloadGcode: vi.fn(),
	uploadAndStart: vi.fn(), cancelSliceJob: vi.fn(),
}))
vi.mock('@/services/moonraker-api.js', () => ({
	fetchState: vi.fn(async () => ({})), uploadAndStart: vi.fn(), cameraStreamUrl: vi.fn(() => ''),
	pausePrint: vi.fn(), resumePrint: vi.fn(), cancelPrint: vi.fn(),
}))
vi.mock('@/services/config-api.js', () => ({ fetchConfig: vi.fn(async () => ({})) }))
vi.mock('@/services/status-api.js', () => ({ fetchAppStatus: vi.fn(async () => ({})) }))
vi.mock('@/services/files-api.js', () => ({ fetchModelBlob: vi.fn(), resolveFile: vi.fn() }))
vi.mock('@/services/gcode-save-api.js', () => ({ saveGcodeToFiles: vi.fn() }))
vi.mock('@/services/moonraker-ws.js', () => ({ MoonrakerWsClient: vi.fn() }))
vi.mock('@/services/events-api.js', () => ({ notifyPrintTransition: vi.fn(async () => ({})) }))
vi.mock('@/services/mesh-convert.js', async (importOriginal) => {
	const actual = await importOriginal()
	return { ...actual, convert3mfToStlBuffer: vi.fn(), list3mfBuildItems: vi.fn(async () => []) }
})

import { usePrintStore } from '@/store/print.js'
import { fetchState } from '@/services/moonraker-api.js'

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

const printing = (partial = {}) => ({
	connected: true,
	state: 'printing',
	filename: 'door.gcode',
	progress: 0.4,
	printDuration: 120,
	...partial,
})

describe('last-seen labels', () => {
	it('formats age in seconds, minutes, and hours', () => {
		const at = 1_000_000
		expect(formatLastSeen(at, at + 12_000)).toBe('Last seen 12s ago')
		expect(formatLastSeen(at, at + 90_000)).toBe('Last seen 2m ago')
		expect(formatLastSeen(at, at + 3_700_000)).toBe('Last seen 1h 2m ago')
	})

	it('does not invent a rate from a short or paused job', () => {
		const now = 5_000_000
		const short = snapshotFromPrinterState(printing({ printDuration: 20, progress: 0.1 }), now)
		expect(short.rateReliable).toBe(false)
		const paused = snapshotFromPrinterState(printing({ state: 'paused', printDuration: 600 }), now)
		expect(paused.rateReliable).toBe(false)
		expect(paused.active).toBe(true)
		const view = staleJobView(paused, now + 120_000)
		expect(view.estimated).toBe(false)
		expect(view.progress).toBe(0.4)
		expect(view.label).toBe('Last known')
		expect(view.lastSeenLabel).toBe('Last seen 2m ago')
	})

	it('estimates from Moonraker progress and elapsed, and never hits 100%', () => {
		const now = 10_000_000
		const snap = snapshotFromPrinterState(printing({ progress: 0.5, printDuration: 100 }), now)
		expect(snap.rateReliable).toBe(true)
		const soon = staleJobView(snap, now + 10_000)
		expect(soon.estimated).toBe(true)
		expect(soon.label).toBe('Estimated from last contact')
		expect(soon.progress).toBeCloseTo(0.55, 5)
		expect(soon.remainingS).toBeCloseTo(90, 5)

		const late = staleJobView(snap, now + 10_000_000)
		expect(late.progress).toBe(0.99)
		expect(late.remainingS).toBe(0)
		expect(late.label).toBe('Estimated from last contact')
	})

	it('ignores a disconnected payload', () => {
		expect(snapshotFromPrinterState({ connected: false, state: 'printing', progress: 0.5 })).toBeNull()
	})
})

describe('print store keeps last contact across a flap', () => {
	beforeEach(() => {
		localStorage.clear()
		sessionStorage.clear()
		setActivePinia(createPinia())
		fetchState.mockReset()
	})

	it('shows Link lost with the last known job, then goes live on the next answer', async () => {
		const store = usePrintStore()
		store.selectedPrinterId = 'k1'
		store._applyPrinterState({
			connected: true,
			state: 'printing',
			filename: 'door.gcode',
			progress: 0.25,
			printDuration: 30,
			message: '',
			lastError: '',
		})
		expect(store.lastContact.filename).toBe('door.gcode')
		expect(store.lastContact.rateReliable).toBe(false)
		expect(store.linkLossView).toBeNull()

		store._applyPrinterState({
			connected: false,
			state: 'offline',
			progress: 0,
			filename: null,
			message: 'Moonraker unreachable',
			lastError: '',
		})
		expect(store.printerState.connected).toBe(false)
		expect(store.printerState.filename).toBeNull()
		expect(store.printerStatusLabel).toBe('Link lost')
		expect(store.printerStatusClass).toBe('link-lost')
		expect(store.linkLossView.active).toBe(true)
		expect(store.linkLossView.estimated).toBe(false)
		expect(store.linkLossView.progress).toBe(0.25)
		expect(store.linkLossView.label).toBe('Last known')
		expect(store.linkLossView.filename).toBe('door.gcode')
		expect(store.workflowStepSubtitle('print')).toBe('Link lost')

		store._applyPrinterState({
			connected: true,
			state: 'printing',
			filename: 'door.gcode',
			progress: 0.5,
			printDuration: 200,
			message: '',
			lastError: '',
		})
		expect(store.printerState.connected).toBe(true)
		expect(store.linkLossView).toBeNull()
		expect(store.printerStatusLabel).toBe('Printing')
	})

	it('stays Checking on the first missed probe and Offline only after another', () => {
		const store = usePrintStore()
		store._applyPrinterState({
			connected: false,
			state: 'offline',
			progress: 0,
			filename: null,
			message: 'Moonraker unreachable',
			lastError: '',
		})
		expect(store.lastContact).toBeNull()
		expect(store.probeMisses).toBe(1)
		expect(store.printerState.state).toBe('checking')
		expect(store.printerStatusLabel).toBe('Checking…')
		expect(store.printerStatusClass).toBe('checking')
		expect(store.linkLossView).toBeNull()

		store._applyPrinterState({
			connected: false,
			state: 'offline',
			message: 'Moonraker unreachable',
			lastError: '',
		})
		expect(store.probeMisses).toBe(2)
		expect(store.printerState.state).toBe('offline')
		expect(store.printerStatusLabel).toBe('Offline')
		expect(store.linkLossView).toBeNull()
	})

	it('does not paint Offline before any probe, and keeps a stored job while checking', () => {
		const store = usePrintStore()
		expect(store.printerState.state).toBe('checking')
		expect(store.printerStatusLabel).toBe('Checking…')

		store.selectedPrinterId = 'k1'
		const at = Date.now() - 4000
		sessionStorage.setItem('nc_print_last_contact', JSON.stringify({
			byId: {
				k1: {
					atMs: at,
					state: 'printing',
					filename: 'cone.gcode',
					progress: 0.33,
					printDurationS: 120,
					active: true,
					rateReliable: true,
				},
			},
		}))
		store._hydrateLastContact()
		expect(store.printerStatusLabel).toBe('Checking…')
		expect(store.linkLossView.filename).toBe('cone.gcode')
		expect(store.linkLossView.active).toBe(true)
		expect(store.targetConnectionLabel).toMatch(/checking…/)
		expect(store.targetConnectionLabel).not.toMatch(/offline/)
	})

	it('clears last contact when the target printer changes', () => {
		const store = usePrintStore()
		store._applyPrinterState({
			connected: true,
			state: 'printing',
			filename: 'door.gcode',
			progress: 0.4,
			printDuration: 120,
		})
		store._resetPrinterState()
		expect(store.lastContact).toBeNull()
	})

	it('keeps last contact when the status poll throws', async () => {
		const store = usePrintStore()
		store.selectedPrinterId = 'k1'
		store._applyPrinterState({
			connected: true,
			state: 'paused',
			filename: 'door.gcode',
			progress: 0.4,
			printDuration: 400,
		})
		fetchState.mockRejectedValueOnce(new Error('timeout'))
		await store.refreshPrinterState()
		expect(store.printerState.connected).toBe(false)
		expect(store.linkLossView.label).toBe('Last known')
		expect(store.linkLossView.progress).toBe(0.4)
		expect(store.linkLossView.estimated).toBe(false)
	})

	it('does not stack a second poll while one is in flight', async () => {
		const store = usePrintStore()
		store.selectedPrinterId = 'k1'
		let release
		fetchState.mockImplementation(() => new Promise((resolve) => {
			release = () => resolve({ connected: true, state: 'standby', progress: 0 })
		}))
		const first = store.refreshPrinterState()
		const second = store.refreshPrinterState()
		await second
		expect(fetchState).toHaveBeenCalledTimes(1)
		release()
		await first
	})
})

describe('link-lost copy is on the print tab', () => {
	it('Print tab labels the stale card and the soft banner', () => {
		const src = read('../components/PrintTab.vue')
		expect(src).toMatch(/Estimated from last contact|linkLoss\.label/)
		expect(src).toMatch(/Link lost/)
		expect(src).toMatch(/data-stale-job/)
		expect(src).toMatch(/Last seen|lastSeenLabel/)
	})
})
