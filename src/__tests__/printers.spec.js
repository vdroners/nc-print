import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@nextcloud/router', () => ({
	generateUrl: (path) => `https://cloud.example${path}`,
}))

vi.mock('@nextcloud/axios', () => ({
	default: { post: vi.fn() },
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

import { discoverPrinters } from '@/services/printers-api.js'
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

	it('addDiscoveredPrinter adds to config, selects it, and drops it from discovered', () => {
		const store = usePrintStore()
		// Polling is out of scope here (needs a live WS client); stub it.
		store.stopPrinterPolling = vi.fn()
		store.startPrinterPolling = vi.fn()
		store.config = { multi_printers: [{ id: 'a', name: 'A', moonraker_url: 'http://10.0.0.5:7125' }] }
		store.discoveredPrinters = [
			{ id: 'found:10.0.0.9', name: 'new', host: '10.0.0.9', moonraker_url: 'http://10.0.0.9:7125' },
		]
		const id = store.addDiscoveredPrinter(store.discoveredPrinters[0])
		expect(id).toBe('found:10.0.0.9')
		expect(store.selectedPrinterId).toBe('found:10.0.0.9')
		expect(store.configuredPrinters.map(p => p.id)).toContain('found:10.0.0.9')
		expect(store.discoveredPrinters).toHaveLength(0)
		// Selecting it also recorded usage.
		expect(store.recentPrinters[0].id).toBe('found:10.0.0.9')
	})
})
