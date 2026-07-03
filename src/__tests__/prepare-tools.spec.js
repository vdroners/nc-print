import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
	applyScaleVector,
	mirrorMesh,
	computeBbox,
	rotationMatrixFromTo,
	applyRotationMatrix,
} from '../services/mesh-analyze.js'
import { cutMeshByPlane } from '../services/mesh-cut.js'

const COMPONENTS = resolve(dirname(fileURLToPath(import.meta.url)), '../components')
const readComponent = (name) => readFileSync(resolve(COMPONENTS, name), 'utf8')

/** Unit cube centered at origin (12 triangles, indexed). */
function unitCube() {
	const positions = new Float32Array([
		-1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1, // z-
		-1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1, // z+
	])
	const indices = new Uint32Array([
		0, 1, 2, 0, 2, 3, // bottom
		4, 6, 5, 4, 7, 6, // top
		0, 4, 5, 0, 5, 1, // front (y-)
		1, 5, 6, 1, 6, 2, // right (x+)
		2, 6, 7, 2, 7, 3, // back (y+)
		3, 7, 4, 3, 4, 0, // left (x-)
	])
	return { positions, indices }
}

/** Sum of signed triangle-normal * area (for winding checks). */
function triNormal(p, ia, ib, ic) {
	const ax = p[3 * ia], ay = p[3 * ia + 1], az = p[3 * ia + 2]
	const bx = p[3 * ib], by = p[3 * ib + 1], bz = p[3 * ib + 2]
	const cx = p[3 * ic], cy = p[3 * ic + 1], cz = p[3 * ic + 2]
	const e1 = [bx - ax, by - ay, bz - az]
	const e2 = [cx - ax, cy - ay, cz - az]
	return [
		e1[1] * e2[2] - e1[2] * e2[1],
		e1[2] * e2[0] - e1[0] * e2[2],
		e1[0] * e2[1] - e1[1] * e2[0],
	]
}

describe('applyScaleVector (G-tool-1)', () => {
	it('scales each axis independently', () => {
		const pos = new Float32Array([1, 2, 3, -1, -2, -3])
		const out = applyScaleVector(pos, [2, 3, 0.5])
		expect(Array.from(out)).toEqual([2, 6, 1.5, -2, -6, -1.5])
	})

	it('treats non-finite factors as 1', () => {
		const pos = new Float32Array([4, 5, 6])
		const out = applyScaleVector(pos, [NaN, undefined, 2])
		expect(Array.from(out)).toEqual([4, 5, 12])
	})
})

describe('mirrorMesh (G-tool-2)', () => {
	it('reflects across the axis and keeps the bbox extent', () => {
		const { positions, indices } = unitCube()
		const before = computeBbox(positions)
		const m = mirrorMesh(positions, indices, 'x')
		const after = computeBbox(m.positions)
		expect(after.x).toBeCloseTo(before.x, 6)
		expect(after.y).toBeCloseTo(before.y, 6)
		expect(after.z).toBeCloseTo(before.z, 6)
	})

	it('reverses triangle winding so normals stay outward', () => {
		const { positions, indices } = unitCube()
		// Bottom face (z-) triangle 0,1,2 has an outward -Z normal.
		const n0 = triNormal(positions, indices[0], indices[1], indices[2])
		const m = mirrorMesh(positions, indices, 'x')
		// After a mirror across X the reflected+re-wound bottom face still
		// points -Z (outward), i.e. the z-component keeps its sign.
		const n1 = triNormal(m.positions, m.indices[0], m.indices[1], m.indices[2])
		expect(Math.sign(n1[2])).toBe(Math.sign(n0[2]))
	})
})

describe('cutMeshByPlane (G-tool-3)', () => {
	it('keeps the bottom half below the Z midplane', () => {
		const { positions, indices } = unitCube()
		const res = cutMeshByPlane(positions, indices, { axis: 'z', position01: 0.5, keep: 'bottom', cap: true })
		expect(res).not.toBeNull()
		const bbox = computeBbox(res.positions)
		expect(bbox.maxZ).toBeLessThanOrEqual(0.001)
		expect(bbox.minZ).toBeCloseTo(-1, 3)
		expect(res.indices.length).toBe(res.positions.length / 3)
	})

	it('keeps the top half above the plane', () => {
		const { positions, indices } = unitCube()
		const res = cutMeshByPlane(positions, indices, { axis: 'z', position01: 0.5, keep: 'top', cap: true })
		const bbox = computeBbox(res.positions)
		expect(bbox.minZ).toBeGreaterThanOrEqual(-0.001)
		expect(bbox.maxZ).toBeCloseTo(1, 3)
	})

	it('adds cap triangles when capping is enabled', () => {
		const { positions, indices } = unitCube()
		const capped = cutMeshByPlane(positions, indices, { axis: 'z', position01: 0.5, keep: 'bottom', cap: true })
		const uncapped = cutMeshByPlane(positions, indices, { axis: 'z', position01: 0.5, keep: 'bottom', cap: false })
		expect(capped.positions.length).toBeGreaterThan(uncapped.positions.length)
	})

	it('returns null when the plane removes the whole model', () => {
		const { positions, indices } = unitCube()
		const res = cutMeshByPlane(positions, indices, { axis: 'z', offset: 100, keep: 'top', cap: true })
		expect(res).toBeNull()
	})
})

describe('place-on-face rotation math (G-tool-4)', () => {
	it('maps a picked face normal onto the plate (-Z)', () => {
		// A face pointing +X should rotate to point -Z after place-on-face.
		const matrix = rotationMatrixFromTo({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: -1 })
		const rotated = applyRotationMatrix(new Float32Array([1, 0, 0]), matrix)
		expect(rotated[0]).toBeCloseTo(0, 6)
		expect(rotated[1]).toBeCloseTo(0, 6)
		expect(rotated[2]).toBeCloseTo(-1, 6)
	})
})

describe('prepare tool UI presence (G-tool-5)', () => {
	it('rail lists the full tool palette', () => {
		const rail = readComponent('PrepareToolRail.vue')
		for (const id of ['move', 'rotate', 'scale', 'face', 'mirror', 'cut', 'view']) {
			expect(rail).toContain(`id: '${id}'`)
		}
		expect(rail).toContain("$emit('tool-change'")
	})

	it('contextual panel handles every tool branch', () => {
		const panel = readComponent('PrepareToolPanel.vue')
		for (const branch of ['move', 'rotate', 'scale', 'face', 'mirror', 'cut', 'view']) {
			expect(panel).toContain(`tool === '${branch}'`)
		}
	})

	it('PrepareTab wires the rail + panel and retires the precise-transform collapsible', () => {
		const tab = readComponent('PrepareTab.vue')
		expect(tab).toContain('PrepareToolRail')
		expect(tab).toContain('PrepareToolPanel')
		expect(tab).toContain('@tool-change="onToolChange"')
		expect(tab).not.toContain('PreciseTransformPanel')
	})
})
