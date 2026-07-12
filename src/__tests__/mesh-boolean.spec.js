import { describe, it, expect } from 'vitest'
import { subtract, union, makeCylinder, MAX_CSG_TRIS } from '../services/mesh-boolean.js'

// A unit cube (0..10) as triangle soup.
function makeBox(s = 10) {
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

function triCount(mesh) {
	return mesh.indices ? mesh.indices.length / 3 : (mesh.positions.length / 3) / 3
}

describe('mesh-boolean (CSG)', () => {
	it('subtract a through-cylinder opens a hole (adds geometry)', () => {
		const box = makeBox(10)
		// Cylinder along Z through the centre, taller than the box.
		const cyl = makeCylinder([5, 5, 5], [0, 0, 1], 2, 40, 32)
		const out = subtract(box, cyl)
		expect(out.positions.length).toBeGreaterThan(0)
		// A drilled box has more triangles than a plain box (the bore wall added).
		expect(triCount(out)).toBeGreaterThan(triCount(box))
	})

	it('union of two overlapping boxes yields a non-empty mesh', () => {
		const a = makeBox(10)
		const b = makeBox(10)
		// shift b by mutating its positions in X by 5
		for (let i = 0; i < b.positions.length; i += 3) {
			b.positions[i] += 5
		}
		const out = union(a, b)
		expect(out.positions.length).toBeGreaterThan(0)
		expect(triCount(out)).toBeGreaterThan(0)
	})

	it('makeCylinder produces a closed-ish mesh with the requested extent', () => {
		const cyl = makeCylinder([0, 0, 0], [0, 0, 1], 3, 20, 24)
		expect(cyl.positions.length).toBeGreaterThan(0)
		// bbox z-extent ~= height (20) within tolerance.
		let minZ = Infinity
		let maxZ = -Infinity
		for (let i = 2; i < cyl.positions.length; i += 3) {
			minZ = Math.min(minZ, cyl.positions[i])
			maxZ = Math.max(maxZ, cyl.positions[i])
		}
		expect(maxZ - minZ).toBeGreaterThan(19)
		expect(maxZ - minZ).toBeLessThan(21)
	})

	it('exposes a perf guard constant', () => {
		expect(MAX_CSG_TRIS).toBeGreaterThan(0)
	})
})
