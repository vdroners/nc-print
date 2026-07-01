import { describe, it, expect } from 'vitest'
import {
	analyzeMesh,
	autoOrient,
	autoRepair,
	applyRotationMatrix,
	applyUniformScale,
	computeBbox,
	countOpenEdges,
	computeOverhangFraction,
	layFlat,
	parseStlToMesh,
	scaleToFitBed,
} from '../services/mesh-analyze.js'

function makeOpenBoxMesh() {
	// Five faces of a unit cube (missing -Z bottom) → open edges
	const positions = new Float32Array([
		0, 0, 0, 1, 0, 0, 1, 1, 0,
		0, 0, 0, 1, 1, 0, 0, 1, 0,
		0, 0, 0, 0, 1, 0, 0, 1, 1,
		0, 0, 0, 0, 1, 1, 0, 0, 1,
		1, 0, 0, 1, 0, 1, 1, 1, 1,
	])
	const indices = new Uint32Array([
		0, 1, 2,
		3, 4, 5,
		6, 7, 8,
		9, 10, 11,
		12, 13, 14,
	])
	return { positions, indices }
}

function makeClosedTetrahedron() {
	const positions = new Float32Array([
		0, 0, 0,
		1, 0, 0,
		0, 1, 0,
		0, 0, 1,
	])
	const indices = new Uint32Array([
		0, 2, 1,
		0, 1, 3,
		0, 3, 2,
		1, 2, 3,
	])
	return { positions, indices }
}

describe('mesh-analyze', () => {
	it('computeBbox returns axis sizes', () => {
		const { positions } = makeClosedTetrahedron()
		const bbox = computeBbox(positions)
		expect(bbox.x).toBeCloseTo(1, 5)
		expect(bbox.y).toBeCloseTo(1, 5)
		expect(bbox.z).toBeCloseTo(1, 5)
	})

	it('detects open edges on non-watertight mesh', () => {
		const { positions, indices } = makeOpenBoxMesh()
		expect(countOpenEdges(positions, indices)).toBeGreaterThan(0)
		const analysis = analyzeMesh(positions, indices)
		expect(analysis.watertight).toBe(false)
		expect(analysis.openEdgeCount).toBeGreaterThan(0)
		expect(analysis.triangleCount).toBe(5)
	})

	it('reports watertight closed tetrahedron', () => {
		const { positions, indices } = makeClosedTetrahedron()
		const analysis = analyzeMesh(positions, indices)
		expect(analysis.watertight).toBe(true)
		expect(analysis.openEdgeCount).toBe(0)
	})

	it('autoOrient returns one of six axis rotations', () => {
		const { positions, indices } = makeClosedTetrahedron()
		const oriented = autoOrient(positions, indices)
		expect(oriented.positions.length).toBe(positions.length)
		expect(oriented.label).toBeTruthy()
		expect(oriented.overhangPct).toBeGreaterThanOrEqual(0)
	})

	it('layFlat rotates mesh without dropping triangles', () => {
		const { positions, indices } = makeClosedTetrahedron()
		const flat = layFlat(positions, indices)
		expect(flat.positions.length).toBe(positions.length)
		const analysis = analyzeMesh(flat.positions, indices)
		expect(analysis.triangleCount).toBe(4)
	})

	it('scaleToFitBed returns <= 1 for oversized bbox', () => {
		const factor = scaleToFitBed({ x: 300, y: 100, z: 50 }, [220, 220, 220])
		expect(factor).toBeLessThan(1)
		expect(factor).toBeCloseTo(220 / 300 * 0.98, 2)
	})

	it('applyUniformScale shrinks positions', () => {
		const positions = new Float32Array([10, 0, 0])
		const scaled = applyUniformScale(positions, 0.5)
		expect(scaled[0]).toBeCloseTo(5)
	})

	it('autoRepair removes duplicate vertices', () => {
		const positions = new Float32Array([
			0, 0, 0,
			1, 0, 0,
			0, 1, 0,
			0, 0, 0,
		])
		const indices = new Uint32Array([0, 1, 2, 3, 1, 2])
		const repaired = autoRepair(positions, indices)
		expect(repaired.positions.length / 3).toBe(3)
		expect(repaired.stats.weldedVertices).toBeGreaterThan(0)
	})

	it('applyRotationMatrix preserves vector length', () => {
		const positions = new Float32Array([1, 2, 3])
		const matrix = [
			0, -1, 0,
			1, 0, 0,
			0, 0, 1,
		]
		const out = applyRotationMatrix(positions, matrix)
		expect(Math.hypot(out[0], out[1], out[2])).toBeCloseTo(Math.hypot(1, 2, 3), 5)
	})

	it('computeOverhangFraction is higher for upward-facing mesh', () => {
		const positions = new Float32Array([
			0, 0, 0, 1, 0, 0, 0, 1, 0,
		])
		const indices = new Uint32Array([0, 1, 2])
		const up = computeOverhangFraction(positions, indices, 45)
		const flipped = applyRotationMatrix(positions, [
			1, 0, 0,
			0, -1, 0,
			0, 0, -1,
		])
		const down = computeOverhangFraction(flipped, indices, 45)
		expect(up).toBeGreaterThanOrEqual(down)
	})

	it('parseStlToMesh reads ASCII STL fixture', () => {
		const ascii = [
			'solid test',
			'  facet normal 0 0 1',
			'    outer loop',
			'      vertex 0 0 0',
			'      vertex 1 0 0',
			'      vertex 0 1 0',
			'    endloop',
			'  endfacet',
			'endsolid test',
		].join('\n')
		const mesh = parseStlToMesh(new TextEncoder().encode(ascii).buffer)
		expect(mesh.indices.length).toBe(3)
		expect(analyzeMesh(mesh.positions, mesh.indices).triangleCount).toBe(1)
	})
})
