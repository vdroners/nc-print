import { describe, it, expect, vi } from 'vitest'

vi.mock('@nextcloud/router', () => ({
	generateUrl: (path) => `https://cloud.example${path}`,
}))

vi.mock('@nextcloud/axios', () => ({
	default: { post: vi.fn() },
}))

global.window = global.window || {}

import { optimizeColorOrder, fetchFlushMatrix } from '@/services/color-order-api.js'
import axios from '@nextcloud/axios'

describe('color-order-api', () => {
	it('posts colors and returns the optimized result', async () => {
		axios.post.mockResolvedValueOnce({
			data: { order: [0, 1], orderedColors: ['#000000', '#FFFFFF'], savedG: 0.4 },
		})
		const res = await optimizeColorOrder({ colors: ['#000000', '#FFFFFF'] })
		expect(res.order).toEqual([0, 1])
		expect(res.savedG).toBe(0.4)
		expect(axios.post).toHaveBeenCalledWith(
			'https://cloud.example/apps/nc_print/api/slicer/color-order',
			{ colors: ['#000000', '#FFFFFF'] },
		)
	})

	it('includes density when provided', async () => {
		axios.post.mockResolvedValueOnce({ data: {} })
		await optimizeColorOrder({ colors: ['#111111', '#222222'], density: 1.04 })
		expect(axios.post).toHaveBeenCalledWith(
			'https://cloud.example/apps/nc_print/api/slicer/color-order',
			{ colors: ['#111111', '#222222'], density: 1.04 },
		)
	})

	it('fetchFlushMatrix posts colors to the flush endpoint (v1.69)', async () => {
		axios.post.mockResolvedValueOnce({
			data: { colors: ['#000000', '#FFFFFF'], names: ['Black', 'White'], matrix: [[0, 700], [280, 0]], grams: [[0, 0.87], [0.35, 0]] },
		})
		const res = await fetchFlushMatrix({ colors: ['#000000', '#FFFFFF'] })
		expect(res.matrix[0][1]).toBe(700)
		expect(res.grams[1][0]).toBe(0.35)
		expect(axios.post).toHaveBeenCalledWith(
			'https://cloud.example/apps/nc_print/api/slicer/flush/matrix',
			{ colors: ['#000000', '#FFFFFF'] },
		)
	})
})
