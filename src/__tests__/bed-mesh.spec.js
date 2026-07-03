import { describe, it, expect } from 'vitest'
import { parseBedMesh, heatColor, normalizeMeshCells, interpolateMatrix } from '@/utils/bed-mesh.js'

describe('WS12: bed mesh', () => {
	const payload = {
		result: {
			status: {
				bed_mesh: {
					profile_name: 'default',
					probed_matrix: [
						[0.0, 0.1, 0.2],
						[-0.1, 0.0, 0.1],
						[-0.2, -0.1, 0.0],
					],
					profiles: { default: {}, cold: {} },
				},
			},
		},
	}

	// G40a: matrix → range
	it('parses probed_matrix and computes range stats', () => {
		const mesh = parseBedMesh(payload)
		expect(mesh).not.toBeNull()
		expect(mesh.rows).toBe(3)
		expect(mesh.cols).toBe(3)
		expect(mesh.min).toBeCloseTo(-0.2)
		expect(mesh.max).toBeCloseTo(0.2)
		expect(mesh.range).toBeCloseTo(0.4)
		expect(mesh.mean).toBeCloseTo(0)
		expect(mesh.profileName).toBe('default')
		expect(mesh.profiles).toEqual(['default', 'cold'])
	})

	it('uses mesh_matrix (finer, interpolated) when available', () => {
		const mesh = parseBedMesh({
			status: {
				bed_mesh: {
					probed_matrix: [[0, 0], [0, 0]],
					mesh_matrix: [[1, 2, 3], [3, 4, 5], [5, 6, 7]],
				},
			},
		})
		// prefers the denser mesh_matrix over the coarse probed_matrix
		expect(mesh.rows).toBe(3)
		expect(mesh.cols).toBe(3)
		expect(mesh.max).toBe(7)
	})

	it('falls back to probed_matrix when mesh_matrix is absent', () => {
		const mesh = parseBedMesh({
			status: { bed_mesh: { probed_matrix: [[1, 2], [3, 4]] } },
		})
		expect(mesh.rows).toBe(2)
		expect(mesh.max).toBe(4)
	})

	it('interpolateMatrix upsamples a coarse grid, preserving corners + bounds', () => {
		const src = [[0, 2], [4, 6]]
		const fine = interpolateMatrix(src, 5)
		expect(fine.length).toBeGreaterThan(2)
		expect(fine[0].length).toBeGreaterThan(2)
		// corners preserved exactly
		expect(fine[0][0]).toBeCloseTo(0)
		expect(fine[0][fine[0].length - 1]).toBeCloseTo(2)
		expect(fine[fine.length - 1][0]).toBeCloseTo(4)
		expect(fine[fine.length - 1][fine[0].length - 1]).toBeCloseTo(6)
		// interpolated values stay within source bounds
		for (const row of fine) {
			for (const v of row) {
				expect(v).toBeGreaterThanOrEqual(0)
				expect(v).toBeLessThanOrEqual(6)
			}
		}
	})

	it('interpolateMatrix leaves tiny matrices untouched', () => {
		expect(interpolateMatrix([[1]], 10)).toEqual([[1]])
		expect(interpolateMatrix([], 10)).toEqual([])
	})

	it('returns null when there is no usable matrix', () => {
		expect(parseBedMesh({ status: { bed_mesh: { probed_matrix: [] } } })).toBeNull()
		expect(parseBedMesh(null)).toBeNull()
		expect(parseBedMesh({ status: {} })).toBeNull()
	})

	// G40a: matrix → normalized heatmap cells
	it('normalizes cells to 0..1 with colors', () => {
		const mesh = parseBedMesh(payload)
		const cells = normalizeMeshCells(mesh.matrix, { min: mesh.min, max: mesh.max })
		expect(cells).toHaveLength(9)
		const min = cells.find(c => c.value === -0.2)
		const max = cells.find(c => c.value === 0.2)
		expect(min.t).toBeCloseTo(0)
		expect(max.t).toBeCloseTo(1)
		expect(min.color).toMatch(/^rgb\(/)
	})

	it('derives its own range when none supplied', () => {
		const cells = normalizeMeshCells([[0, 10]], {})
		expect(cells[0].t).toBeCloseTo(0)
		expect(cells[1].t).toBeCloseTo(1)
	})

	it('heatColor clamps and returns rgb', () => {
		expect(heatColor(-5)).toMatch(/^rgb\(/)
		expect(heatColor(2)).toMatch(/^rgb\(/)
		expect(heatColor(0.5)).toMatch(/^rgb\(/)
	})
})
