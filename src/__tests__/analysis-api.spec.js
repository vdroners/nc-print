import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@nextcloud/router', () => ({
	generateUrl: (path) => `https://cloud.example${path}`,
}))
vi.mock('@nextcloud/axios', () => ({
	default: { get: vi.fn(), post: vi.fn() },
}))

import { lintGcode, gcodeReference, searchGcodeReference, printerPreset } from '@/services/analysis-api.js'
import axios from '@nextcloud/axios'

describe('analysis-api', () => {
	beforeEach(() => {
		axios.get.mockReset()
		axios.post.mockReset()
	})

	it('lintGcode posts a job_id + firmware', async () => {
		axios.post.mockResolvedValueOnce({ data: { issues: [], stats: {} } })
		await lintGcode({ jobId: 'j1', firmware: 'klipper' })
		expect(axios.post).toHaveBeenCalledWith(
			'https://cloud.example/apps/nc_print/api/slicer/gcode/lint',
			{ firmware: 'klipper', job_id: 'j1' },
		)
	})

	it('lintGcode prefers raw text over job_id', async () => {
		axios.post.mockResolvedValueOnce({ data: { issues: [] } })
		await lintGcode({ jobId: 'j1', text: 'G28' })
		expect(axios.post.mock.calls[0][1]).toEqual({ firmware: 'auto', text: 'G28' })
	})

	it('gcodeReference returns the entry, or null on 404', async () => {
		axios.get.mockResolvedValueOnce({ data: { code: 'M104', category: 'temperature' } })
		expect((await gcodeReference('M104')).category).toBe('temperature')
		axios.get.mockRejectedValueOnce({ response: { status: 404 } })
		expect(await gcodeReference('ZZZ')).toBeNull()
	})

	it('searchGcodeReference builds the query string', async () => {
		axios.get.mockResolvedValueOnce({ data: { reference: [{ code: 'M104' }] } })
		const list = await searchGcodeReference({ category: 'temperature' })
		expect(list).toEqual([{ code: 'M104' }])
		expect(axios.get).toHaveBeenCalledWith(
			'https://cloud.example/apps/nc_print/api/slicer/gcode/reference?category=temperature',
		)
	})

	it('printerPreset returns null on 404', async () => {
		axios.get.mockRejectedValueOnce({ response: { status: 404 } })
		expect(await printerPreset('nobody', 'nothing')).toBeNull()
	})
})
