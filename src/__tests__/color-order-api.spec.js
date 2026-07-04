import { describe, it, expect, vi } from 'vitest'

vi.mock('@nextcloud/router', () => ({
	generateUrl: (path) => `https://cloud.example${path}`,
}))

vi.mock('@nextcloud/axios', () => ({
	default: { post: vi.fn() },
}))

global.window = global.window || {}

import { optimizeColorOrder } from '@/services/color-order-api.js'
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
})
