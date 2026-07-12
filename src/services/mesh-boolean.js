/**
 * Boolean mesh operations (CSG) over the app's plain {positions, indices} mesh
 * shape, built on three-bvh-csg. Used by drill (subtract a cylinder), emboss
 * (union/subtract text), and hollow drain holes.
 *
 * Everything is world-space, indexed triangle soup in / out — the same contract
 * as mesh-analyze.js / mesh-cut.js so viewport `addObjectFromMesh` /
 * `applyMeshSnapshot` consume the result directly.
 *
 * CSG is O(n log n) but still heavy; callers should guard on triangle count
 * (MAX_CSG_TRIS) and surface a friendly message rather than freezing the tab.
 */
import * as THREE from 'three'
import { Brush, Evaluator, ADDITION, SUBTRACTION, INTERSECTION } from 'three-bvh-csg'

/** Above this combined triangle count a boolean is refused (perf guard). */
export const MAX_CSG_TRIS = 400_000

/**
 * @param {{positions: (Float32Array|number[]), indices?: (Uint32Array|number[])}} mesh
 * @returns {THREE.BufferGeometry} non-indexed geometry with normals
 */
function toGeometry(mesh) {
	const geo = new THREE.BufferGeometry()
	const pos = mesh.positions instanceof Float32Array ? mesh.positions : new Float32Array(mesh.positions)
	geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
	if (mesh.indices && mesh.indices.length) {
		const idx = mesh.indices instanceof Uint32Array ? mesh.indices : new Uint32Array(mesh.indices)
		geo.setIndex(new THREE.BufferAttribute(idx, 1))
	}
	// three-bvh-csg wants position + a couple of attributes present; normals are
	// enough. Non-indexed keeps the evaluator happy across versions.
	const nonIndexed = geo.index ? geo.toNonIndexed() : geo
	nonIndexed.computeVertexNormals()
	return nonIndexed
}

/**
 * @param {THREE.BufferGeometry} geo
 * @returns {{positions: Float32Array, indices: Uint32Array}}
 */
function fromGeometry(geo) {
	const posAttr = geo.getAttribute('position')
	const positions = new Float32Array(posAttr.array)
	// Result is non-indexed triangle soup → sequential indices.
	const indices = new Uint32Array(positions.length / 3)
	for (let i = 0; i < indices.length; i++) {
		indices[i] = i
	}
	return { positions, indices }
}

function triCount(mesh) {
	if (mesh.indices && mesh.indices.length) {
		return mesh.indices.length / 3
	}
	return (mesh.positions.length / 3) / 3
}

/**
 * Run a boolean op. Throws Error('csg_too_large') when over the guard.
 * @param {object} a mesh {positions, indices}
 * @param {object} b mesh {positions, indices}
 * @param {number} op ADDITION | SUBTRACTION | INTERSECTION
 * @returns {{positions: Float32Array, indices: Uint32Array}}
 */
function evaluate(a, b, op) {
	if (triCount(a) + triCount(b) > MAX_CSG_TRIS) {
		throw new Error('csg_too_large')
	}
	const brushA = new Brush(toGeometry(a))
	const brushB = new Brush(toGeometry(b))
	brushA.updateMatrixWorld()
	brushB.updateMatrixWorld()
	const evaluator = new Evaluator()
	evaluator.useGroups = false
	// Only carry attributes we actually provide — the default list includes 'uv',
	// which our geometry lacks, and the evaluator would deref undefined.
	evaluator.attributes = ['position', 'normal']
	const result = evaluator.evaluate(brushA, brushB, op)
	return fromGeometry(result.geometry)
}

export function subtract(a, b) {
	return evaluate(a, b, SUBTRACTION)
}

export function union(a, b) {
	return evaluate(a, b, ADDITION)
}

export function intersect(a, b) {
	return evaluate(a, b, INTERSECTION)
}

/**
 * Build a solid cylinder mesh (Z-up), centred at `center`, oriented along
 * `dir` (unit vector). Used by the drill tool. Returns {positions, indices}.
 * @param {[number,number,number]} center
 * @param {[number,number,number]} dir unit axis
 * @param {number} radius
 * @param {number} height
 * @param {number} [segments]
 */
export function makeCylinder(center, dir, radius, height, segments = 48) {
	const geo = new THREE.CylinderGeometry(radius, radius, height, segments)
	// CylinderGeometry is Y-up; orient it to `dir`.
	const from = new THREE.Vector3(0, 1, 0)
	const to = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize()
	const quat = new THREE.Quaternion().setFromUnitVectors(from, to)
	geo.applyQuaternion(quat)
	geo.translate(center[0], center[1], center[2])
	const nonIndexed = geo.index ? geo.toNonIndexed() : geo
	return fromGeometry(nonIndexed)
}
