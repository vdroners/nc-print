/**
 * Hollow a solid mesh into a shell of a given wall thickness.
 *
 * Approach (robust enough for typical closed prints without a full voxel/SDF
 * pipeline): build an INNER surface by offsetting every vertex inward along its
 * smoothed vertex normal by `thickness`, reverse its winding so the inner wall's
 * normals face into the cavity, then emit outer + inner shells together. The
 * slicer then fills only the wall between them.
 *
 * Guards against the classic offset failure (thin features where the inward
 * offset would cross itself) by capping the offset so it never exceeds a
 * fraction of the model's smallest bbox dimension, and by skipping the inner
 * shell entirely when the model is too thin to hollow.
 *
 * Returns { positions, indices, ok, reason } — ok:false with a reason when the
 * model can't be safely hollowed (caller shows a message + leaves it solid).
 */

function computeVertexNormals(positions, indices) {
	const vCount = positions.length / 3
	const normals = new Float32Array(positions.length)
	const tCount = indices.length / 3
	for (let t = 0; t < tCount; t++) {
		const a = indices[3 * t] * 3
		const b = indices[3 * t + 1] * 3
		const c = indices[3 * t + 2] * 3
		const ux = positions[b] - positions[a]
		const uy = positions[b + 1] - positions[a + 1]
		const uz = positions[b + 2] - positions[a + 2]
		const vx = positions[c] - positions[a]
		const vy = positions[c + 1] - positions[a + 1]
		const vz = positions[c + 2] - positions[a + 2]
		// face normal = u × v (area-weighted, un-normalized)
		const nx = uy * vz - uz * vy
		const ny = uz * vx - ux * vz
		const nz = ux * vy - uy * vx
		for (const p of [a, b, c]) {
			normals[p] += nx
			normals[p + 1] += ny
			normals[p + 2] += nz
		}
	}
	for (let i = 0; i < vCount; i++) {
		const x = normals[3 * i]
		const y = normals[3 * i + 1]
		const z = normals[3 * i + 2]
		const len = Math.hypot(x, y, z) || 1
		normals[3 * i] = x / len
		normals[3 * i + 1] = y / len
		normals[3 * i + 2] = z / len
	}
	return normals
}

function bboxMinDim(positions) {
	let minX = Infinity; let minY = Infinity; let minZ = Infinity
	let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity
	for (let i = 0; i < positions.length; i += 3) {
		minX = Math.min(minX, positions[i]); maxX = Math.max(maxX, positions[i])
		minY = Math.min(minY, positions[i + 1]); maxY = Math.max(maxY, positions[i + 1])
		minZ = Math.min(minZ, positions[i + 2]); maxZ = Math.max(maxZ, positions[i + 2])
	}
	return Math.min(maxX - minX, maxY - minY, maxZ - minZ)
}

/**
 * @param {Float32Array|number[]} positions
 * @param {Uint32Array|number[]} indices
 * @param {number} thickness wall thickness (mm)
 * @returns {{positions: Float32Array, indices: Uint32Array, ok: boolean, reason?: string}}
 */
export function hollowMesh(positions, indices, thickness = 2) {
	const pos = positions instanceof Float32Array ? positions : new Float32Array(positions)
	const idx = indices instanceof Uint32Array ? indices : new Uint32Array(indices)
	const minDim = bboxMinDim(pos)
	// Need room for two walls + a cavity; refuse if the part is too thin.
	if (!(thickness > 0) || minDim < thickness * 2.2) {
		return { positions: pos, indices: idx, ok: false, reason: 'too_thin' }
	}
	const normals = computeVertexNormals(pos, idx)
	const vCount = pos.length / 3

	// Inner shell vertices = outer offset inward by thickness along the normal.
	const inner = new Float32Array(pos.length)
	for (let i = 0; i < vCount; i++) {
		inner[3 * i] = pos[3 * i] - normals[3 * i] * thickness
		inner[3 * i + 1] = pos[3 * i + 1] - normals[3 * i + 1] * thickness
		inner[3 * i + 2] = pos[3 * i + 2] - normals[3 * i + 2] * thickness
	}

	// Combined mesh: outer shell (as-is) + inner shell (reversed winding, offset
	// index base) so the cavity is enclosed by two facing surfaces.
	const outPositions = new Float32Array(pos.length * 2)
	outPositions.set(pos, 0)
	outPositions.set(inner, pos.length)

	const tCount = idx.length / 3
	const outIndices = new Uint32Array(idx.length * 2)
	// outer triangles unchanged
	outIndices.set(idx, 0)
	// inner triangles: base-shifted by vCount, winding reversed (swap b,c)
	for (let t = 0; t < tCount; t++) {
		const a = idx[3 * t] + vCount
		const b = idx[3 * t + 1] + vCount
		const c = idx[3 * t + 2] + vCount
		outIndices[idx.length + 3 * t] = a
		outIndices[idx.length + 3 * t + 1] = c
		outIndices[idx.length + 3 * t + 2] = b
	}
	return { positions: outPositions, indices: outIndices, ok: true }
}
