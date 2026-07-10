import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@nextcloud/router', () => ({
	generateUrl: (path) => `https://cloud.example${path}`,
}))
vi.mock('@nextcloud/axios', () => ({
	default: { get: vi.fn(), delete: vi.fn() },
}))

import {
	fetchHistory,
	fetchMetrics,
	fetchWear,
	deleteHistoryRecord,
	clearHistory,
} from '@/services/history-api.js'
import axios from '@nextcloud/axios'

const base = 'https://cloud.example/apps/nc_print/api/history'

describe('history-api', () => {
	beforeEach(() => {
		axios.get.mockReset()
		axios.delete.mockReset()
	})

	it('fetchHistory only sends non-empty filters, with a timeout', async () => {
		axios.get.mockResolvedValueOnce({ data: { items: [], total: 0 } })
		await fetchHistory({ result: 'complete', material: '', limit: 25, offset: 50 })
		const [url, opts] = axios.get.mock.calls[0]
		expect(url).toBe(base)
		expect(opts.params).toEqual({ result: 'complete', limit: 25, offset: 50 })
		expect(opts).toEqual(expect.objectContaining({ timeout: expect.any(Number) }))
	})

	it('fetchHistory maps printerId -> printer_id and from/to', async () => {
		axios.get.mockResolvedValueOnce({ data: { items: [] } })
		await fetchHistory({ printerId: 'k1', from: 100, to: 200 })
		expect(axios.get.mock.calls[0][1].params).toEqual({ printer_id: 'k1', from: 100, to: 200 })
	})

	it('fetchMetrics and fetchWear hit the right endpoints with a timeout', async () => {
		axios.get.mockResolvedValue({ data: {} })
		await fetchMetrics()
		await fetchWear()
		expect(axios.get.mock.calls[0][0]).toBe(`${base}/metrics`)
		expect(axios.get.mock.calls[1][0]).toBe(`${base}/wear`)
		for (const call of axios.get.mock.calls) {
			expect(call[1]).toEqual(expect.objectContaining({ timeout: expect.any(Number) }))
		}
	})

	it('deleteHistoryRecord DELETEs the id endpoint', async () => {
		axios.delete.mockResolvedValueOnce({ data: { ok: true, deleted: true } })
		const r = await deleteHistoryRecord(42)
		expect(axios.delete).toHaveBeenCalledWith(`${base}/42`, expect.objectContaining({ timeout: expect.any(Number) }))
		expect(r.deleted).toBe(true)
	})

	it('clearHistory DELETEs the collection endpoint', async () => {
		axios.delete.mockResolvedValueOnce({ data: { ok: true, cleared: 3 } })
		const r = await clearHistory()
		expect(axios.delete).toHaveBeenCalledWith(base, expect.objectContaining({ timeout: expect.any(Number) }))
		expect(r.cleared).toBe(3)
	})
})
