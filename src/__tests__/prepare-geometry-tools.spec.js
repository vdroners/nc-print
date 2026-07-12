import { describe, it, expect } from 'vitest'
import { hollowMesh } from '../services/mesh-hollow.js'
import { arrangeObjects } from '../services/mesh-arrange.js'
import { makeTextMesh } from '../services/mesh-emboss.js'

function makeBox(s = 20) {
	const v = [
		[0, 0, 0], [s, 0, 0], [s, s, 0], [0, s, 0],
		[0, 0, s], [s, 0, s], [s, s, s], [0, s, s],
	]
	const faces = [
		[0, 1, 2], [0, 2, 3], [4, 6, 5], [4, 7, 6],
		[0, 4, 5], [0, 5, 1], [1, 5, 6], [1, 6, 2],
		[2, 6, 7], [2, 7, 3], [3, 7, 4], [3, 4, 0],
	]
	const positions = []
	const indices = []
	let i = 0
	for (const f of faces) {
		for (const idx of f) {
			positions.push(v[idx][0], v[idx][1], v[idx][2])
			indices.push(i++)
		}
	}
	return { positions: new Float32Array(positions), indices: new Uint32Array(indices) }
}

describe('mesh-hollow', () => {
	it('hollows a thick box into a two-shell mesh (roughly doubles triangles)', () => {
		const box = makeBox(20)
		const out = hollowMesh(box.positions, box.indices, 2)
		expect(out.ok).toBe(true)
		expect(out.indices.length).toBe(box.indices.length * 2)
		expect(out.positions.length).toBe(box.positions.length * 2)
	})

	it('refuses to hollow a part too thin for the wall thickness', () => {
		const thin = makeBox(3) // 3mm min dim, wall 2 → needs >=4.4mm
		const out = hollowMesh(thin.positions, thin.indices, 2)
		expect(out.ok).toBe(false)
		expect(out.reason).toBe('too_thin')
	})
})

describe('mesh-arrange', () => {
	it('lays out non-overlapping objects within the bed', () => {
		const items = [
			{ id: 'a', size: [50, 50], z: 0 },
			{ id: 'b', size: [50, 50], z: 0 },
			{ id: 'c', size: [50, 50], z: 0 },
		]
		const { placements, ok, overflow } = arrangeObjects(items, [220, 220, 250], 5)
		expect(placements).toHaveLength(3)
		expect(ok).toBe(true)
		expect(overflow).toBe(0)
		// centres within the bed
		for (const p of placements) {
			expect(p.center[0]).toBeGreaterThan(0)
			expect(p.center[0]).toBeLessThan(220)
			expect(p.center[1]).toBeGreaterThan(0)
			expect(p.center[1]).toBeLessThan(220)
		}
	})

	it('flags overflow when a part is larger than the bed', () => {
		const items = [{ id: 'big', size: [300, 300], z: 0 }]
		const { ok, overflow } = arrangeObjects(items, [220, 220, 250], 5)
		expect(ok).toBe(false)
		expect(overflow).toBe(1)
	})
})

describe('mesh-emboss', () => {
	it('builds a non-empty extruded text mesh oriented to a face normal', () => {
		const mesh = makeTextMesh({
			text: 'AB',
			size: 6,
			depth: 1,
			point: [10, 10, 20],
			normal: [0, 0, 1],
		})
		expect(mesh).not.toBeNull()
		expect(mesh.positions.length).toBeGreaterThan(0)
		expect(mesh.indices.length % 3).toBe(0)
	})

	it('returns null for empty text', () => {
		expect(makeTextMesh({ text: '   ', point: [0, 0, 0], normal: [0, 0, 1] })).toBeNull()
	})
})
