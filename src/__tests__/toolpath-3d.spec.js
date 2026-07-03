import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@nextcloud/router', () => ({
	generateUrl: (p) => p,
}))

import { fetchToolpath, presentFeatures, FEATURE_COLORS } from '@/services/toolpath-3d.js'

const SAMPLE = {
	units: 'mm',
	bbox: { min: [0, 0, 0.2], max: [10, 10, 0.4] },
	feature_types: ['outer_wall', 'sparse_infill', 'travel'],
	layers: [
		{
			z: 0.2, height: 0.2,
			segments: {
				outer_wall: { positions: [0, 0, 0.2, 10, 0, 0.2] },
				travel: { positions: [10, 0, 0.2, 0, 0, 0.2] },
			},
		},
		{
			z: 0.4, height: 0.2,
			segments: { outer_wall: { positions: [0, 0, 0.4, 10, 0, 0.4] } },
		},
	],
	meta: { layer_count: 2 },
}

describe('fetchToolpath', () => {
	beforeEach(() => {
		global.fetch = vi.fn(async () => ({
			ok: true,
			json: async () => SAMPLE,
		}))
	})

	it('converts each feature segment to a Float32Array', async () => {
		const tp = await fetchToolpath('job1')
		expect(tp.layerCount).toBe(2)
		expect(tp.layers).toHaveLength(2)
		const ow = tp.layers[0].features.outer_wall
		expect(ow).toBeInstanceOf(Float32Array)
		expect(ow).toHaveLength(6)
		const expected = [0, 0, 0.2, 10, 0, 0.2]
		expected.forEach((v, i) => expect(ow[i]).toBeCloseTo(v, 4))
		expect(tp.layers[0].features.travel).toBeInstanceOf(Float32Array)
	})

	it('drops segments with fewer than 6 floats', async () => {
		global.fetch = vi.fn(async () => ({
			ok: true,
			json: async () => ({
				...SAMPLE,
				layers: [{ z: 0.2, height: 0.2, segments: { outer_wall: { positions: [0, 0, 0.2] } } }],
			}),
		}))
		const tp = await fetchToolpath('job1')
		expect(tp.layers[0].features.outer_wall).toBeUndefined()
	})

	it('throws on non-ok response', async () => {
		global.fetch = vi.fn(async () => ({ ok: false, status: 404 }))
		await expect(fetchToolpath('missing')).rejects.toThrow(/404/)
	})
})

describe('presentFeatures', () => {
	it('returns features present across layers in canonical order', async () => {
		global.fetch = vi.fn(async () => ({ ok: true, json: async () => SAMPLE }))
		const tp = await fetchToolpath('job1')
		expect(presentFeatures(tp)).toEqual(['outer_wall', 'travel'])
	})
})

describe('FEATURE_COLORS', () => {
	it('has a colour for every canonical feature type', () => {
		for (const f of SAMPLE.feature_types) {
			expect(FEATURE_COLORS[f]).toBeTypeOf('number')
		}
	})
})
