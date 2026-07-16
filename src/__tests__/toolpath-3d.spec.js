import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@nextcloud/router', () => ({
	generateUrl: (p) => p,
}))

import { fetchToolpath, presentFeatures, colorForSpeed, FEATURE_COLORS, FEATURE_LABELS } from '@/services/toolpath-3d.js'

const SAMPLE = {
	units: 'mm',
	bbox: { min: [0, 0, 0.2], max: [10, 10, 0.4] },
	feature_types: ['outer_wall', 'sparse_infill', 'travel'],
	layers: [
		{
			z: 0.2, height: 0.2,
			segments: {
				outer_wall: { positions: [0, 0, 0.2, 10, 0, 0.2], speeds: [30] },
				travel: { positions: [10, 0, 0.2, 0, 0, 0.2], speeds: [150] },
			},
		},
		{
			z: 0.4, height: 0.2,
			segments: { outer_wall: { positions: [0, 0, 0.4, 10, 0, 0.4], speeds: [30] } },
		},
	],
	meta: { layer_count: 2, speed_min: 30, speed_max: 120 },
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

	it('carries per-segment speeds + a speed range for color-by-speed', async () => {
		const tp = await fetchToolpath('job1')
		expect(tp.speedRange).toEqual({ min: 30, max: 120 })
		expect(tp.layers[0].speeds.outer_wall).toBeInstanceOf(Float32Array)
		expect(tp.layers[0].speeds.outer_wall[0]).toBe(30)
	})

	it('omits speedRange when the sidecar emits no speeds (old build)', async () => {
		global.fetch = vi.fn(async () => ({
			ok: true,
			json: async () => ({ ...SAMPLE, meta: { layer_count: 2 } }),
		}))
		const tp = await fetchToolpath('job1')
		expect(tp.speedRange).toBeNull()
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

	it('has distinct colours + labels for seam and retraction (v1.64)', () => {
		expect(FEATURE_COLORS.seam).toBeTypeOf('number')
		expect(FEATURE_COLORS.retraction).toBeTypeOf('number')
		expect(FEATURE_COLORS.seam).not.toBe(FEATURE_COLORS.retraction)
		expect(FEATURE_LABELS.seam).toBe('Seams')
		expect(FEATURE_LABELS.retraction).toBe('Retractions')
	})
})

describe('colorForSpeed', () => {
	it('maps min→blue-ish, max→red-ish across the ramp', () => {
		const lo = colorForSpeed(0, 0, 100)
		const hi = colorForSpeed(100, 0, 100)
		// low end is blue-dominant, high end red-dominant
		expect(lo[2]).toBeGreaterThan(lo[0]) // blue > red at min
		expect(hi[0]).toBeGreaterThan(hi[2]) // red > blue at max
		// all channels in [0,1]
		for (const c of [...lo, ...hi]) {
			expect(c).toBeGreaterThanOrEqual(0)
			expect(c).toBeLessThanOrEqual(1)
		}
	})

	it('clamps out-of-range + handles a zero span', () => {
		expect(colorForSpeed(-50, 0, 100)).toEqual(colorForSpeed(0, 0, 100))
		expect(colorForSpeed(999, 0, 100)).toEqual(colorForSpeed(100, 0, 100))
		const flat = colorForSpeed(50, 50, 50) // zero span → mid ramp
		expect(flat).toHaveLength(3)
	})
})
