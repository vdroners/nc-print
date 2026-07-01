import { describe, it, expect, vi } from 'vitest'

vi.mock('@nextcloud/router', () => ({
	generateUrl: (path) => `https://cloud.example${path}`,
}))

vi.mock('@nextcloud/axios', () => ({
	default: { get: vi.fn() },
}))

global.window = global.window || {}

import { statusApiUrl, fetchAppStatus } from '@/services/status-api.js'
import axios from '@nextcloud/axios'

describe('status-api', () => {
	it('statusApiUrl contains api/status', () => {
		expect(statusApiUrl()).toBe('https://cloud.example/apps/nc_print/api/status')
	})

	it('fetchAppStatus calls axios get', async () => {
		axios.get.mockResolvedValueOnce({ data: { slicer_ok: true } })
		const data = await fetchAppStatus()
		expect(data.slicer_ok).toBe(true)
		expect(axios.get).toHaveBeenCalled()
	})
})
