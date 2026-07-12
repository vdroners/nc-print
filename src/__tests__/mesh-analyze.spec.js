import { describe, it, expect } from 'vitest'
import {
	analyzeMesh,
	autoOrient,
	autoRepair,
	applyRotationMatrix,
	applyUniformScale,
	computeBbox,
	countOpenEdges,
	countNonManifoldEdges,
	computeOverhangFraction,
	fillBoundaryHoles,
	layFlat,
	parseStlToMesh,
	scaleToFitBed,
	scaleToMaxFitBed,
	splitNonManifoldEdges,
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

// Closed axis-aligned box, sizes (sx,sy,sz), 12 triangles.
function makeBox(sx, sy, sz) {
	const v = [
		[0, 0, 0], [sx, 0, 0], [sx, sy, 0], [0, sy, 0],
		[0, 0, sz], [sx, 0, sz], [sx, sy, sz], [0, sy, sz],
	]
	const faces = [
		[0, 1, 2], [0, 2, 3], // bottom
		[4, 6, 5], [4, 7, 6], // top
		[0, 4, 5], [0, 5, 1], // -Y
		[1, 5, 6], [1, 6, 2], // +X
		[2, 6, 7], [2, 7, 3], // +Y
		[3, 7, 4], [3, 4, 0], // -X
	]
	const positions = new Float32Array(faces.length * 9)
	const indices = new Uint32Array(faces.length * 3)
	let p = 0
	let i = 0
	for (const f of faces) {
		for (const idx of f) {
			positions[p++] = v[idx][0]
			positions[p++] = v[idx][1]
			positions[p++] = v[idx][2]
			indices[i] = i
			i++
		}
	}
	return { positions, indices }
}

function bboxHeight(positions) {
	let minZ = Infinity
	let maxZ = -Infinity
	for (let i = 2; i < positions.length; i += 3) {
		minZ = Math.min(minZ, positions[i])
		maxZ = Math.max(maxZ, positions[i])
	}
	return maxZ - minZ
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

	it('autoOrient accepts a mode and echoes it back', () => {
		const { positions, indices } = makeClosedTetrahedron()
		for (const mode of ['default', 'supports', 'footprint']) {
			const oriented = autoOrient(positions, indices, { mode })
			expect(oriented.mode).toBe(mode)
			expect(oriented.positions.length).toBe(positions.length)
			expect(oriented.label).toBeTruthy()
		}
	})

	it('autoOrient footprint mode picks the flattest orientation of a tall box', () => {
		// A box that is tall in Z (10) and thin in X/Y (2×2). Footprint mode must
		// lay it down (a 90° rotation), giving a shorter bbox height than identity.
		const box = makeBox(2, 2, 10)
		const foot = autoOrient(box.positions, box.indices, { mode: 'footprint' })
		const footH = bboxHeight(foot.positions)
		const identH = bboxHeight(box.positions)
		expect(footH).toBeLessThan(identH)
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

	it('scaleToFitBed caps at 1 for a small model (shrink-only)', () => {
		expect(scaleToFitBed({ x: 20, y: 20, z: 20 }, [220, 220, 220])).toBe(1)
	})

	it('scaleToMaxFitBed grows a small model to fill the bed (no cap)', () => {
		const factor = scaleToMaxFitBed({ x: 20, y: 20, z: 20 }, [220, 220, 220])
		expect(factor).toBeGreaterThan(1)
		expect(factor).toBeCloseTo(220 / 20 * 0.98, 2)
	})

	it('scaleToMaxFitBed shrinks an oversized model like fit', () => {
		const factor = scaleToMaxFitBed({ x: 300, y: 100, z: 50 }, [220, 220, 220])
		expect(factor).toBeCloseTo(220 / 300 * 0.98, 2)
	})

	it('scaleToMaxFitBed returns 1 for unusable inputs', () => {
		expect(scaleToMaxFitBed(null, [220, 220, 220])).toBe(1)
		expect(scaleToMaxFitBed({ x: 0, y: 0, z: 0 }, [220, 220, 220])).toBe(1)
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

	it('autoRepair fills a boundary hole to watertight', () => {
		// Tetrahedron (4 verts) missing its base face → one triangular hole.
		const positions = new Float32Array([
			0, 0, 0,
			1, 0, 0,
			0, 1, 0,
			0, 0, 1,
		])
		// three side faces, base (0,1,2) intentionally omitted → open
		const indices = new Uint32Array([
			0, 1, 3,
			1, 2, 3,
			2, 0, 3,
		])
		const before = analyzeMesh(positions, indices)
		expect(before.watertight).toBe(false)
		const repaired = autoRepair(positions, indices)
		expect(repaired.stats.filledTriangles).toBeGreaterThan(0)
		const after = analyzeMesh(repaired.positions, repaired.indices)
		expect(after.watertight).toBe(true)
	})

	it('fillBoundaryHoles closes a large (>8 edge) hole via a centroid fan', () => {
		// An open regular polygon "lid" hole: a fan of triangles around a center
		// with the outer ring left open (the outer boundary is a 12-edge loop).
		const n = 12
		const positions = [0, 0, 1] // center apex at index 0 (a shallow cone, open base)
		for (let i = 0; i < n; i++) {
			const t = (i / n) * Math.PI * 2
			positions.push(Math.cos(t), Math.sin(t), 0)
		}
		const indices = []
		for (let i = 0; i < n; i++) {
			// side faces apex→ring[i]→ring[i+1] — the base ring stays open.
			indices.push(0, 1 + i, 1 + ((i + 1) % n))
		}
		expect(countOpenEdges(positions, indices)).toBe(n)
		const added = fillBoundaryHoles(positions, indices)
		expect(added).toBeGreaterThan(0)
		// The base ring (12 edges) is now closed → no open edges remain.
		expect(countOpenEdges(positions, indices)).toBe(0)
	})

	it('splitNonManifoldEdges detaches a fin shared by three triangles', () => {
		// Two triangles share edge (0,1); a third triangle also uses (0,1) → the
		// edge is used by 3 faces (non-manifold).
		const positions = [
			0, 0, 0, // 0
			1, 0, 0, // 1
			0, 1, 0, // 2
			0, -1, 0, // 3
			0, 0, 1, // 4 (the fin's apex)
		]
		const indices = [
			0, 1, 2,
			1, 0, 3,
			0, 1, 4, // third face on edge (0,1)
		]
		expect(countNonManifoldEdges(positions, indices)).toBeGreaterThan(0)
		const split = splitNonManifoldEdges(positions, indices)
		expect(split).toBeGreaterThan(0)
		expect(countNonManifoldEdges(positions, indices)).toBe(0)
	})

	it('analyzeMesh reports nonManifoldCount and fails watertight when non-manifold', () => {
		const positions = [
			0, 0, 0, 1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1,
		]
		const indices = [0, 1, 2, 1, 0, 3, 0, 1, 4]
		const a = analyzeMesh(positions, indices)
		expect(a.nonManifoldCount).toBeGreaterThan(0)
		expect(a.watertight).toBe(false)
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
