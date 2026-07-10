import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@nextcloud/router', () => ({
	generateUrl: (path) => `https://cloud.example${path}`,
}))

vi.mock('@nextcloud/axios', () => ({
	default: { post: vi.fn(), get: vi.fn() },
}))

// print store service mocks (mirror print-monitor.spec.js)
vi.mock('@/services/toast.js', () => ({
	toastError: vi.fn(), toastSuccess: vi.fn(), toastWarning: vi.fn(), toastInfo: vi.fn(),
}))
vi.mock('@/services/slicer-api.js', () => ({
	fetchProfiles: vi.fn(async () => []), sliceStream: vi.fn(), downloadGcode: vi.fn(),
	uploadAndStart: vi.fn(), cancelSliceJob: vi.fn(),
}))
vi.mock('@/services/moonraker-api.js', () => ({
	fetchState: vi.fn(async () => ({})), uploadAndStart: vi.fn(), cameraStreamUrl: vi.fn(() => ''),
}))
vi.mock('@/services/config-api.js', () => ({ fetchConfig: vi.fn(async () => ({})) }))
vi.mock('@/services/status-api.js', () => ({ fetchAppStatus: vi.fn(async () => ({})) }))
vi.mock('@/services/files-api.js', () => ({ fetchModelBlob: vi.fn(), resolveFile: vi.fn() }))
vi.mock('@/services/gcode-save-api.js', () => ({ saveGcodeToFiles: vi.fn() }))
vi.mock('@/services/moonraker-ws.js', () => ({ MoonrakerWsClient: vi.fn() }))
vi.mock('@/services/mesh-convert.js', async (importOriginal) => {
	const actual = await importOriginal()
	return { ...actual, convert3mfToStlBuffer: vi.fn(), list3mfBuildItems: vi.fn(async () => []) }
})

vi.mock('@/services/printers-api.js', async (importOriginal) => {
	const actual = await importOriginal()
	return {
		...actual,
		registerSessionPrinter: vi.fn(async (p) => p),
	}
})
import { discoverPrinters, fetchCapabilities, registerSessionPrinter } from '@/services/printers-api.js'
import axios from '@nextcloud/axios'
import { usePrintStore } from '@/store/print.js'

describe('printers-api', () => {
	it('discoverPrinters posts and returns the printers array', async () => {
		axios.post.mockResolvedValueOnce({ data: { ok: true, printers: [{ host: '10.0.0.5' }] } })
		const found = await discoverPrinters()
		expect(found).toEqual([{ host: '10.0.0.5' }])
		expect(axios.post).toHaveBeenCalledWith('https://cloud.example/apps/nc_print/api/printers/discover', {})
	})

	it('discoverPrinters passes hosts/subnet when given', async () => {
		axios.post.mockResolvedValueOnce({ data: { printers: [] } })
		await discoverPrinters({ hosts: '10.0.0.9', subnet: '10.0.0.' })
		expect(axios.post).toHaveBeenCalledWith(
			'https://cloud.example/apps/nc_print/api/printers/discover',
			{ hosts: '10.0.0.9', subnet: '10.0.0.' },
		)
	})

	it('fetchCapabilities gets and returns the capabilities object', async () => {
		axios.get.mockResolvedValueOnce({ data: { ok: true, capabilities: { extruders: 1 } } })
		const caps = await fetchCapabilities('k1')
		expect(caps).toEqual({ extruders: 1 })
		expect(axios.get).toHaveBeenCalledWith(
			'https://cloud.example/apps/nc_print/api/printer/capabilities?printer_id=k1',
		)
	})

	it('fetchCapabilities returns null when none reported', async () => {
		axios.get.mockResolvedValueOnce({ data: { ok: false, capabilities: null } })
		expect(await fetchCapabilities('k1')).toBeNull()
	})
})

describe('print store recent printers', () => {
	beforeEach(() => {
		localStorage.clear()
		setActivePinia(createPinia())
	})

	function withPrinters(store, rows) {
		store.config = { multi_printers: rows }
	}

	it('recordPrinterUsage builds an MRU, most-recent-first, deduped', () => {
		const store = usePrintStore()
		withPrinters(store, [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }])
		store.recordPrinterUsage('a')
		store.recordPrinterUsage('b')
		store.recordPrinterUsage('a') // re-use A -> moves to front, no dupe
		expect(store.recentPrinters.map(r => r.id)).toEqual(['a', 'b'])
	})

	it('recordPrinterUsage caps at 5', () => {
		const store = usePrintStore()
		withPrinters(store, ['a', 'b', 'c', 'd', 'e', 'f'].map(id => ({ id, name: id.toUpperCase() })))
		for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) {
			store.recordPrinterUsage(id)
		}
		expect(store.recentPrinters).toHaveLength(5)
		expect(store.recentPrinters[0].id).toBe('f') // last used first
	})

	it('recordPrinterUsage persists to localStorage', () => {
		const store = usePrintStore()
		withPrinters(store, [{ id: 'a', name: 'A' }])
		store.recordPrinterUsage('a')
		const saved = JSON.parse(localStorage.getItem('nc_print_recent_printers_v1'))
		expect(saved.map(r => r.id)).toEqual(['a'])
	})

	it('printerPickerGroups splits recent / configured / discovered and dedupes', () => {
		const store = usePrintStore()
		withPrinters(store, [
			{ id: 'a', name: 'A', moonraker_url: 'http://10.0.0.5:7125' },
			{ id: 'b', name: 'B', moonraker_url: 'http://10.0.0.6:7125' },
		])
		store.recordPrinterUsage('b')
		// One discovered matches a configured URL (should be dropped), one is new.
		store.discoveredPrinters = [
			{ id: 'found:10.0.0.5', name: 'dup', moonraker_url: 'http://10.0.0.5:7125' },
			{ id: 'found:10.0.0.9', name: 'new', moonraker_url: 'http://10.0.0.9:7125' },
		]
		const g = store.printerPickerGroups
		expect(g.recent.map(p => p.id)).toEqual(['b'])
		expect(g.configured.map(p => p.id)).toEqual(['a']) // b is under recent
		expect(g.discovered.map(p => p.id)).toEqual(['found:10.0.0.9'])
	})
})

describe('print store discovery actions', () => {
	beforeEach(() => {
		localStorage.clear()
		setActivePinia(createPinia())
	})

	it('discoverPrinters populates discoveredPrinters with derived id/name', async () => {
		const store = usePrintStore()
		store.stopPrinterPolling = vi.fn()
		store.startPrinterPolling = vi.fn()
		store.fetchPrinterCapabilities = vi.fn(async () => null)
		store.selectedPrinterId = 'keep-me'
		axios.post.mockResolvedValueOnce({
			data: { printers: [{ host: '10.0.0.42', moonraker_url: 'http://10.0.0.42:7125', hostname: 'voron', klippy_state: 'ready' }] },
		})
		await store.discoverPrinters()
		expect(store.discoveredPrinters).toHaveLength(1)
		expect(store.discoveredPrinters[0].id).toBe('found:10.0.0.42')
		expect(store.discoveredPrinters[0].name).toBe('voron')
		expect(store.discovering).toBe(false)
	})

	it('discoverPrinters records an error on failure', async () => {
		const store = usePrintStore()
		axios.post.mockRejectedValueOnce(new Error('network down'))
		const res = await store.discoverPrinters()
		expect(res).toEqual([])
		expect(store.discoverError).toBe('network down')
		expect(store.discovering).toBe(false)
	})

	it('addDiscoveredPrinter registers session, adds to config, selects it', async () => {
		const store = usePrintStore()
		store.stopPrinterPolling = vi.fn()
		store.startPrinterPolling = vi.fn()
		store.fetchPrinterCapabilities = vi.fn(async () => null)
		store.config = { multi_printers: [{ id: 'a', name: 'A', moonraker_url: 'http://10.0.0.5:7125' }] }
		store.discoveredPrinters = [
			{ id: 'found:10.0.0.9', name: 'new', host: '10.0.0.9', moonraker_url: 'http://10.0.0.9:7125' },
		]
		registerSessionPrinter.mockResolvedValueOnce({ id: 'found:10.0.0.9' })
		const id = await store.addDiscoveredPrinter(store.discoveredPrinters[0])
		expect(registerSessionPrinter).toHaveBeenCalled()
		expect(id).toBe('found:10.0.0.9')
		expect(store.selectedPrinterId).toBe('found:10.0.0.9')
		expect(store.configuredPrinters.map(p => p.id)).toContain('found:10.0.0.9')
		expect(store.discoveredPrinters).toHaveLength(0)
		expect(store.recentPrinters[0].id).toBe('found:10.0.0.9')
	})
	it('discoverPrinters auto-selects when exactly one printer is found', async () => {
		const store = usePrintStore()
		store.stopPrinterPolling = vi.fn()
		store.startPrinterPolling = vi.fn()
		store.fetchPrinterCapabilities = vi.fn(async () => null)
		store.config = { multi_printers: [] }
		axios.post.mockResolvedValueOnce({
			data: { printers: [{ host: '10.0.0.42', moonraker_url: 'http://10.0.0.42:7125', hostname: 'k1', klippy_state: 'ready' }] },
		})
		registerSessionPrinter.mockResolvedValueOnce({ id: 'found:10.0.0.42' })
		await store.discoverPrinters()
		expect(registerSessionPrinter).toHaveBeenCalled()
		expect(store.selectedPrinterId).toBe('found:10.0.0.42')
	})

	it('connectPrinterByHost probes a single IP and selects the printer', async () => {
		const store = usePrintStore()
		store.stopPrinterPolling = vi.fn()
		store.startPrinterPolling = vi.fn()
		store.fetchPrinterCapabilities = vi.fn(async () => null)
		store.config = { multi_printers: [] }
		axios.post.mockResolvedValueOnce({
			data: { printers: [{ host: '10.0.0.210', moonraker_url: 'http://10.0.0.210:7125', klippy_state: 'ready' }] },
		})
		registerSessionPrinter.mockResolvedValueOnce({ id: 'found:10.0.0.210' })
		const id = await store.connectPrinterByHost('10.0.0.210')
		expect(axios.post).toHaveBeenCalledWith(
			'https://cloud.example/apps/nc_print/api/printers/discover',
			{ hosts: '10.0.0.210' },
		)
		expect(id).toBe('found:10.0.0.210')
		expect(store.selectedPrinterId).toBe('found:10.0.0.210')
	})
})

describe('print store target printer validation', () => {
	beforeEach(() => {
		localStorage.clear()
		setActivePinia(createPinia())
	})

	it('configuredPrinters is empty when multi_printers missing', () => {
		const store = usePrintStore()
		store.config = {}
		expect(store.configuredPrinters).toEqual([])
	})

	it('_validateSelectedPrinterId clears ghost default id', () => {
		const store = usePrintStore()
		store.config = { multi_printers: [] }
		store.selectedPrinterId = 'default'
		localStorage.setItem('nc_print_prefs_v1', JSON.stringify({ selectedPrinterId: 'default' }))
		store._validateSelectedPrinterId()
		expect(store.selectedPrinterId).toBe('')
	})

	it('ensureSessionTarget re-registers from cached targetPrinter prefs', async () => {
		const store = usePrintStore()
		store.config = { multi_printers: [] }
		localStorage.setItem('nc_print_prefs_v1', JSON.stringify({
			selectedPrinterId: 'found:10.0.0.9',
			targetPrinter: {
				id: 'found:10.0.0.9',
				name: 'Voron',
				moonraker_url: 'http://10.0.0.9:7125',
				camera_url: 'http://10.0.0.9:8080/?action=stream',
			},
		}))
		registerSessionPrinter.mockResolvedValueOnce({ id: 'found:10.0.0.9' })
		await store.ensureSessionTarget()
		expect(registerSessionPrinter).toHaveBeenCalledWith(expect.objectContaining({
			id: 'found:10.0.0.9',
			moonraker_url: 'http://10.0.0.9:7125',
		}))
		expect(store.selectedPrinterId).toBe('found:10.0.0.9')
		expect(store.configuredPrinters.map(p => p.id)).toContain('found:10.0.0.9')
	})
})

describe('print store printer capabilities', () => {
	beforeEach(() => {
		localStorage.clear()
		setActivePinia(createPinia())
	})

	it('fetchPrinterCapabilities caches by id and does not re-fetch', async () => {
		const store = usePrintStore()
		axios.get.mockResolvedValueOnce({ data: { ok: true, capabilities: { build_volume: { x: 300, y: 300, z: 250 }, extruders: 1 } } })
		const caps = await store.fetchPrinterCapabilities('k1')
		expect(caps.extruders).toBe(1)
		expect(store.printerCapabilities.k1.build_volume.x).toBe(300)
		// Second call is served from cache (no new axios.get).
		axios.get.mockClear()
		await store.fetchPrinterCapabilities('k1')
		expect(axios.get).not.toHaveBeenCalled()
	})

	it('fetchPrinterCapabilities caches null on failure (no repeat storm)', async () => {
		const store = usePrintStore()
		axios.get.mockRejectedValueOnce(new Error('unreachable'))
		const caps = await store.fetchPrinterCapabilities('k1')
		expect(caps).toBeNull()
		expect(store.printerCapabilities).toHaveProperty('k1', null)
	})

	it('activePrinterCapabilityLabel formats build volume + extruders + enclosure', async () => {
		const store = usePrintStore()
		store.config = { multi_printers: [{ id: 'k1', name: 'K1', default: true }] }
		store.selectedPrinterId = 'k1'
		axios.get.mockResolvedValueOnce({ data: { capabilities: { build_volume: { x: 309, y: 308, z: 315 }, extruders: 2, has_enclosure: true } } })
		await store.fetchPrinterCapabilities('k1')
		expect(store.activePrinterCapabilityLabel).toBe('309×308×315 · 2 extruders · enclosed')
	})

	it('activePrinterCapabilityLabel is empty when unknown', () => {
		const store = usePrintStore()
		store.config = { multi_printers: [{ id: 'k1', name: 'K1', default: true }] }
		store.selectedPrinterId = 'k1'
		expect(store.activePrinterCapabilityLabel).toBe('')
	})
})
