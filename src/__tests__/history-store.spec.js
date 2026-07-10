import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Store service mocks (mirror eta.spec.js) + the new history-api.
vi.mock('@nextcloud/router', () => ({
	generateUrl: (path) => `https://cloud.example${path}`,
}))
vi.mock('@nextcloud/axios', () => ({
	default: { post: vi.fn(), get: vi.fn(), delete: vi.fn() },
}))
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
vi.mock('@/services/history-api.js', () => ({
	fetchHistory: vi.fn(),
	fetchMetrics: vi.fn(),
	fetchWear: vi.fn(),
	deleteHistoryRecord: vi.fn(),
	clearHistory: vi.fn(),
}))

import { usePrintStore } from '@/store/print.js'
import {
	fetchHistory, fetchMetrics, fetchWear, deleteHistoryRecord, clearHistory,
} from '@/services/history-api.js'

describe('print store history actions', () => {
	beforeEach(() => {
		localStorage.clear()
		setActivePinia(createPinia())
		fetchHistory.mockReset()
		fetchMetrics.mockReset()
		fetchWear.mockReset()
		deleteHistoryRecord.mockReset()
		clearHistory.mockReset()
	})

	it('fetchHistory loads items + total and passes filters', async () => {
		const store = usePrintStore()
		store.history.filters.result = 'complete'
		store.history.limit = 25
		fetchHistory.mockResolvedValueOnce({ items: [{ id: 1 }, { id: 2 }], total: 2 })
		await store.fetchHistory()
		expect(fetchHistory).toHaveBeenCalledWith(expect.objectContaining({
			result: 'complete', limit: 25, offset: 0,
		}))
		expect(store.history.items).toHaveLength(2)
		expect(store.history.total).toBe(2)
		expect(store.history.loading).toBe(false)
	})

	it('fetchHistory swallows failures and empties the list', async () => {
		const store = usePrintStore()
		store.history.items = [{ id: 9 }]
		fetchHistory.mockRejectedValueOnce(new Error('boom'))
		await store.fetchHistory()
		expect(store.history.items).toEqual([])
		expect(store.history.total).toBe(0)
		expect(store.history.loading).toBe(false)
	})

	it('fetchHistoryMetrics and fetchHistoryWear store their payloads', async () => {
		const store = usePrintStore()
		fetchMetrics.mockResolvedValueOnce({ overall: { total: 3 }, by_printer: [] })
		fetchWear.mockResolvedValueOnce({ printers: [{ printer_id: 'k1' }], disclaimer: 'est' })
		await store.fetchHistoryMetrics()
		await store.fetchHistoryWear()
		expect(store.history.metrics.overall.total).toBe(3)
		expect(store.history.wear.printers[0].printer_id).toBe('k1')
	})

	it('deleteHistoryRecord removes the row locally on success', async () => {
		const store = usePrintStore()
		store.history.items = [{ id: 1 }, { id: 2 }]
		store.history.total = 2
		deleteHistoryRecord.mockResolvedValueOnce({ ok: true, deleted: true })
		const ok = await store.deleteHistoryRecord(1)
		expect(ok).toBe(true)
		expect(store.history.items).toEqual([{ id: 2 }])
		expect(store.history.total).toBe(1)
	})

	it('clearHistory empties list + metrics + wear on success', async () => {
		const store = usePrintStore()
		store.history.items = [{ id: 1 }]
		store.history.total = 1
		store.history.metrics = { overall: {} }
		store.history.wear = { printers: [] }
		clearHistory.mockResolvedValueOnce({ ok: true, cleared: 1 })
		const ok = await store.clearHistory()
		expect(ok).toBe(true)
		expect(store.history.items).toEqual([])
		expect(store.history.total).toBe(0)
		expect(store.history.metrics).toBeNull()
		expect(store.history.wear).toBeNull()
	})
})
