import { describe, it, expect, vi } from 'vitest'

vi.mock('@nextcloud/router', () => ({
	generateUrl: (path) => `https://cloud.example${path}`,
}))

vi.mock('@nextcloud/axios', () => ({
	default: { get: vi.fn(), post: vi.fn() },
}))

global.window = global.window || {}

import { fetchCalibrations, fetchGenerators, generateCalibration } from '@/services/calibration-api.js'
import axios from '@nextcloud/axios'

describe('calibration-api', () => {
	it('fetchCalibrations returns the calibrations array', async () => {
		axios.get.mockResolvedValueOnce({ data: { calibrations: [{ id: 'temp-tower' }], generators: [] } })
		const list = await fetchCalibrations()
		expect(list).toEqual([{ id: 'temp-tower' }])
	})

	it('fetchGenerators returns the generators array', async () => {
		axios.get.mockResolvedValueOnce({
			data: { calibrations: [], generators: [{ id: 'retract-tower', kind: 'gcode' }] },
		})
		const gens = await fetchGenerators()
		expect(gens).toEqual([{ id: 'retract-tower', kind: 'gcode' }])
	})

	it('fetchGenerators tolerates a missing generators key', async () => {
		axios.get.mockResolvedValueOnce({ data: { calibrations: [] } })
		expect(await fetchGenerators()).toEqual([])
	})

	it('generateCalibration posts type+params and returns the job payload', async () => {
		axios.post.mockResolvedValueOnce({ data: { job_id: 'j1', name: 'Retract tower', type: 'retract-tower' } })
		const res = await generateCalibration({ type: 'retract-tower', params: { retractStart: 1 } })
		expect(res.job_id).toBe('j1')
		expect(axios.post).toHaveBeenCalledWith(
			'https://cloud.example/apps/nc_print/api/slicer/calibration/generate',
			{ type: 'retract-tower', params: { retractStart: 1 } },
		)
	})
})
