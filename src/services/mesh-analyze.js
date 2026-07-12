/**
 * Client-side mesh analysis and repair (ported from Forge stl-analyzer / mesh-repair concepts).
 * Operates on indexed triangle meshes: { positions: Float32Array, indices: Uint32Array }.
 */

const DEFAULT_OVERHANG_DEG = 45

/**
 * @param {Float32Array|number[]} positions
 * @returns {{ x: number, y: number, z: number, minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number }}
 */
export function computeBbox(positions) {
	let minX = Infinity
	let minY = Infinity
	let minZ = Infinity
	let maxX = -Infinity
	let maxY = -Infinity
	let maxZ = -Infinity
	for (let i = 0; i < positions.length; i += 3) {
		const x = positions[i]
		const y = positions[i + 1]
		const z = positions[i + 2]
		minX = Math.min(minX, x)
		maxX = Math.max(maxX, x)
		minY = Math.min(minY, y)
		maxY = Math.max(maxY, y)
		minZ = Math.min(minZ, z)
		maxZ = Math.max(maxZ, z)
	}
	return {
		x: maxX - minX,
		y: maxY - minY,
		z: maxZ - minZ,
		minX,
		minY,
		minZ,
		maxX,
		maxY,
		maxZ,
	}
}

/**
 * @param {Float32Array} positions
 * @param {number} i0
 * @param {number} i1
 * @param {number} i2
 * @returns {{ nx: number, ny: number, nz: number, area: number }}
 */
function triangleNormalAndArea(positions, i0, i1, i2) {
	const ax = positions[3 * i0]
	const ay = positions[3 * i0 + 1]
	const az = positions[3 * i0 + 2]
	const bx = positions[3 * i1]
	const by = positions[3 * i1 + 1]
	const bz = positions[3 * i1 + 2]
	const cx = positions[3 * i2]
	const cy = positions[3 * i2 + 1]
	const cz = positions[3 * i2 + 2]
	const e1x = bx - ax
	const e1y = by - ay
	const e1z = bz - az
	const e2x = cx - ax
	const e2y = cy - ay
	const e2z = cz - az
	let nx = e1y * e2z - e1z * e2y
	let ny = e1z * e2x - e1x * e2z
	let nz = e1x * e2y - e1y * e2x
	const area = Math.hypot(nx, ny, nz) * 0.5
	const len = area * 2
	if (len > 0) {
		nx /= len
		ny /= len
		nz /= len
	}
	return { nx, ny, nz, area }
}

/**
 * @param {number} a
 * @param {number} b
 */
function edgeKey(a, b) {
	return a < b ? `${a}|${b}` : `${b}|${a}`
}

/**
 * @param {Float32Array} positions
 * @param {Uint32Array|number[]} indices
 * @param {number} [overhangDeg]
 * @returns {number} fraction 0..1 of faces needing support
 */
export function computeOverhangFraction(positions, indices, overhangDeg = DEFAULT_OVERHANG_DEG) {
	const sinThreshold = Math.sin(overhangDeg * Math.PI / 180)
	const triCount = indices.length / 3
	if (triCount === 0) {
		return 0
	}
	let overhang = 0
	for (let f = 0; f < triCount; f++) {
		const { nz } = triangleNormalAndArea(
			positions,
			indices[3 * f],
			indices[3 * f + 1],
			indices[3 * f + 2],
		)
		if (nz > sinThreshold) {
			overhang++
		}
	}
	return overhang / triCount
}

/**
 * @param {Float32Array} positions
 * @param {Uint32Array|number[]} indices
 * @returns {number}
 */
export function countOpenEdges(positions, indices) {
	const edges = new Map()
	const triCount = indices.length / 3
	for (let f = 0; f < triCount; f++) {
		const a = indices[3 * f]
		const b = indices[3 * f + 1]
		const c = indices[3 * f + 2]
		for (const [e0, e1] of [[a, b], [b, c], [c, a]]) {
			const key = edgeKey(e0, e1)
			edges.set(key, (edges.get(key) || 0) + 1)
		}
	}
	let open = 0
	for (const count of edges.values()) {
		if (count === 1) {
			open++
		}
	}
	return open
}

/**
 * Count non-manifold edges — undirected edges shared by MORE than two triangles.
 * A well-formed printable surface has every edge used by exactly two triangles.
 * @param {Float32Array} positions
 * @param {Uint32Array|number[]} indices
 * @returns {number}
 */
export function countNonManifoldEdges(positions, indices) {
	const edges = new Map()
	const triCount = indices.length / 3
	for (let f = 0; f < triCount; f++) {
		const a = indices[3 * f]
		const b = indices[3 * f + 1]
		const c = indices[3 * f + 2]
		for (const [e0, e1] of [[a, b], [b, c], [c, a]]) {
			const key = edgeKey(e0, e1)
			edges.set(key, (edges.get(key) || 0) + 1)
		}
	}
	let nonManifold = 0
	for (const count of edges.values()) {
		if (count > 2) {
			nonManifold++
		}
	}
	return nonManifold
}

/**
 * @param {Float32Array} positions
 * @param {Uint32Array|number[]} indices
 * @param {{ overhangDeg?: number }} [options]
 */
export function analyzeMesh(positions, indices, options = {}) {
	const overhangDeg = options.overhangDeg ?? DEFAULT_OVERHANG_DEG
	const triangleCount = indices.length / 3
	const bbox = computeBbox(positions)
	const openEdgeCount = countOpenEdges(positions, indices)
	const nonManifoldCount = countNonManifoldEdges(positions, indices)
	const overhangFrac = computeOverhangFraction(positions, indices, overhangDeg)
	return {
		triangleCount,
		bbox: { x: bbox.x, y: bbox.y, z: bbox.z },
		openEdgeCount,
		openEdges: openEdgeCount,
		nonManifoldCount,
		overhangPct: Math.round(overhangFrac * 1000) / 10,
		// Printable when closed AND manifold.
		watertight: openEdgeCount === 0 && nonManifoldCount === 0,
	}
}

/**
 * @param {number} ax
 * @param {number} ay
 * @param {number} az
 * @param {number} bx
 * @param {number} by
 * @param {number} bz
 */
function cross(ax, ay, az, bx, by, bz) {
	return {
		x: ay * bz - az * by,
		y: az * bx - ax * bz,
		z: ax * by - ay * bx,
	}
}

/**
 * @param {number} x
 * @param {number} y
 * @param {number} z
 */
function normalize(x, y, z) {
	const len = Math.hypot(x, y, z)
	if (len <= 0) {
		return { x: 0, y: 0, z: 1 }
	}
	return { x: x / len, y: y / len, z: z / len }
}

/**
 * Rotation matrix mapping unit vector `from` to unit vector `to` (3x3 row-major flat).
 * @param {{ x: number, y: number, z: number }} from
 * @param {{ x: number, y: number, z: number }} to
 * @returns {number[]}
 */
export function rotationMatrixFromTo(from, to) {
	const f = normalize(from.x, from.y, from.z)
	const t = normalize(to.x, to.y, to.z)
	const dot = f.x * t.x + f.y * t.y + f.z * t.z
	if (dot > 0.999999) {
		return [1, 0, 0, 0, 1, 0, 0, 0, 1]
	}
	if (dot < -0.999999) {
		const axis = normalize(f.y, -f.x, 0)
		if (Math.hypot(axis.x, axis.y, axis.z) < 1e-6) {
			return [-1, 0, 0, 0, -1, 0, 0, 0, 1]
		}
		return rotationMatrixAxisAngle(axis.x, axis.y, axis.z, Math.PI)
	}
	const v = cross(f.x, f.y, f.z, t.x, t.y, t.z)
	const s = Math.hypot(v.x, v.y, v.z)
	const c = dot
	const vx = v.x / s
	const vy = v.y / s
	const vz = v.z / s
	const k = 1 - c
	return [
		vx * vx * k + c, vx * vy * k - vz * s, vx * vz * k + vy * s,
		vy * vx * k + vz * s, vy * vy * k + c, vy * vz * k - vx * s,
		vz * vx * k - vy * s, vz * vy * k + vx * s, vz * vz * k + c,
	]
}

/**
 * @param {number} ax
 * @param {number} ay
 * @param {number} az
 * @param {number} radians
 * @returns {number[]}
 */
export function rotationMatrixAxisAngle(ax, ay, az, radians) {
	const { x, y, z } = normalize(ax, ay, az)
	const c = Math.cos(radians)
	const s = Math.sin(radians)
	const k = 1 - c
	return [
		x * x * k + c, x * y * k - z * s, x * z * k + y * s,
		y * x * k + z * s, y * y * k + c, y * z * k - x * s,
		z * x * k - y * s, z * y * k + x * s, z * z * k + c,
	]
}

/** Six axis-aligned 90° rotations for auto-orient. */
export const AXIS_ORIENTATIONS = Object.freeze([
	{ label: 'identity', matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1] },
	{ label: 'rx90', matrix: rotationMatrixAxisAngle(1, 0, 0, Math.PI / 2) },
	{ label: 'rx270', matrix: rotationMatrixAxisAngle(1, 0, 0, -Math.PI / 2) },
	{ label: 'ry90', matrix: rotationMatrixAxisAngle(0, 1, 0, Math.PI / 2) },
	{ label: 'ry270', matrix: rotationMatrixAxisAngle(0, 1, 0, -Math.PI / 2) },
	{ label: 'rz90', matrix: rotationMatrixAxisAngle(0, 0, 1, Math.PI / 2) },
])

/**
 * @param {Float32Array} positions
 * @param {number[]} matrix 3x3 row-major
 * @returns {Float32Array}
 */
export function applyRotationMatrix(positions, matrix) {
	const out = new Float32Array(positions.length)
	for (let i = 0; i < positions.length; i += 3) {
		const x = positions[i]
		const y = positions[i + 1]
		const z = positions[i + 2]
		out[i] = matrix[0] * x + matrix[1] * y + matrix[2] * z
		out[i + 1] = matrix[3] * x + matrix[4] * y + matrix[5] * z
		out[i + 2] = matrix[6] * x + matrix[7] * y + matrix[8] * z
	}
	return out
}

/**
 * Pick orientation with lowest overhang among six axis-aligned rotations.
 * @param {Float32Array} positions
 * @param {Uint32Array|number[]} indices
 * @param {{ overhangDeg?: number }} [options]
 * @returns {{ positions: Float32Array, matrix: number[], label: string, overhangPct: number }}
 */
export function autoOrient(positions, indices, options = {}) {
	const overhangDeg = options.overhangDeg ?? DEFAULT_OVERHANG_DEG
	// mode: 'default' (balanced overhang + height) | 'supports' (least overhang)
	//       | 'footprint' (flattest / most bed contact).
	const mode = options.mode ?? 'default'

	// Evaluate every axis-aligned candidate once (overhang + bbox), then score.
	const cands = AXIS_ORIENTATIONS.map((c) => {
		const rotated = applyRotationMatrix(positions, c.matrix)
		const frac = computeOverhangFraction(rotated, indices, overhangDeg)
		const bbox = computeBbox(rotated)
		return {
			positions: rotated,
			matrix: c.matrix,
			label: c.label,
			frac,
			overhangPct: Math.round(frac * 1000) / 10,
			height: bbox.z,
			footprint: Math.max(1e-6, bbox.x * bbox.y),
		}
	})

	// Normalizers so height/footprint are comparable to the 0..1 overhang frac.
	const maxHeight = Math.max(...cands.map((c) => c.height), 1e-6)
	const maxFootprint = Math.max(...cands.map((c) => c.footprint), 1e-6)

	const score = (c) => {
		if (mode === 'supports') {
			// Least overhang; tie-break on lower height.
			return c.frac + (c.height / maxHeight) * 1e-3
		}
		if (mode === 'footprint') {
			// Flattest / most stable: smallest height, largest bed contact;
			// tie-break on lower overhang.
			return (c.height / maxHeight) - (c.footprint / maxFootprint) * 0.25 + c.frac * 1e-3
		}
		// default: balanced — overhang dominates, height nudges the tie.
		return c.frac + (c.height / maxHeight) * 0.35
	}

	let best = null
	for (const c of cands) {
		const s = score(c)
		if (!best || s < best._score) {
			best = { ...c, _score: s }
		}
	}
	return {
		positions: best.positions,
		matrix: best.matrix,
		label: best.label,
		overhangPct: best.overhangPct,
		mode,
	}
}

/**
 * Rotate so the largest-area face normal points down (-Z) onto the bed.
 * @param {Float32Array} positions
 * @param {Uint32Array|number[]} indices
 */
export function layFlat(positions, indices) {
	const triCount = indices.length / 3
	let bestArea = -1
	let bestNormal = { x: 0, y: 0, z: 1 }
	for (let f = 0; f < triCount; f++) {
		const { nx, ny, nz, area } = triangleNormalAndArea(
			positions,
			indices[3 * f],
			indices[3 * f + 1],
			indices[3 * f + 2],
		)
		if (area > bestArea) {
			bestArea = area
			bestNormal = { x: nx, y: ny, z: nz }
		}
	}
	const matrix = rotationMatrixFromTo(bestNormal, { x: 0, y: 0, z: -1 })
	return {
		positions: applyRotationMatrix(positions, matrix),
		matrix,
	}
}

/**
 * Uniform scale factor to fit bbox inside build volume (XY required; Z optional cap).
 * @param {{ x: number, y: number, z: number }} bbox
 * @param {number[]} buildVolume [x, y, z] mm
 * @param {number} [margin=0.98]
 * @returns {number}
 */
export function scaleToFitBed(bbox, buildVolume, margin = 0.98) {
	if (!bbox || !buildVolume || buildVolume.length < 2) {
		return 1
	}
	const [bx, by, bz = Infinity] = buildVolume
	const sx = bbox.x > 0 ? (bx * margin) / bbox.x : 1
	const sy = bbox.y > 0 ? (by * margin) / bbox.y : 1
	const sz = bbox.z > 0 && Number.isFinite(bz) ? (bz * margin) / bbox.z : 1
	return Math.min(sx, sy, sz, 1)
}

/**
 * Largest uniform factor that still fits the build volume — like scaleToFitBed
 * but WITHOUT the shrink-only cap, so a small model grows to fill the bed.
 * @param {{ x: number, y: number, z: number }} bbox
 * @param {number[]} buildVolume [x, y, z] mm
 * @param {number} [margin=0.98]
 * @returns {number} factor (>0); 1 if inputs are unusable
 */
export function scaleToMaxFitBed(bbox, buildVolume, margin = 0.98) {
	if (!bbox || !buildVolume || buildVolume.length < 2) {
		return 1
	}
	const [bx, by, bz = Infinity] = buildVolume
	const sx = bbox.x > 0 ? (bx * margin) / bbox.x : Infinity
	const sy = bbox.y > 0 ? (by * margin) / bbox.y : Infinity
	const sz = bbox.z > 0 && Number.isFinite(bz) ? (bz * margin) / bbox.z : Infinity
	const f = Math.min(sx, sy, sz)
	return Number.isFinite(f) && f > 0 ? f : 1
}

/**
 * @param {Float32Array} positions
 * @param {number} scale
 * @returns {Float32Array}
 */
export function applyUniformScale(positions, scale) {
	if (scale === 1) {
		return positions.slice()
	}
	const out = new Float32Array(positions.length)
	for (let i = 0; i < positions.length; i++) {
		out[i] = positions[i] * scale
	}
	return out
}

/**
 * Per-axis (non-uniform) scale of a position buffer.
 * @param {Float32Array} positions
 * @param {number[]} scale [sx, sy, sz]
 * @returns {Float32Array}
 */
export function applyScaleVector(positions, scale) {
	const sx = Number.isFinite(scale?.[0]) ? scale[0] : 1
	const sy = Number.isFinite(scale?.[1]) ? scale[1] : 1
	const sz = Number.isFinite(scale?.[2]) ? scale[2] : 1
	const out = new Float32Array(positions.length)
	for (let i = 0; i < positions.length; i += 3) {
		out[i] = positions[i] * sx
		out[i + 1] = positions[i + 1] * sy
		out[i + 2] = positions[i + 2] * sz
	}
	return out
}

/**
 * Mirror a mesh across an axis-aligned plane through the bbox center, flipping
 * triangle winding so outward normals are preserved.
 * @param {Float32Array} positions
 * @param {Uint32Array|number[]} indices
 * @param {'x'|'y'|'z'} axis
 * @returns {{ positions: Float32Array, indices: Uint32Array }}
 */
export function mirrorMesh(positions, indices, axis) {
	const ci = axis === 'x' ? 0 : axis === 'y' ? 1 : 2
	const bbox = computeBbox(positions)
	const center = ci === 0 ? (bbox.minX + bbox.maxX) / 2
		: ci === 1 ? (bbox.minY + bbox.maxY) / 2
			: (bbox.minZ + bbox.maxZ) / 2
	const out = new Float32Array(positions.length)
	for (let i = 0; i < positions.length; i += 3) {
		out[i] = positions[i]
		out[i + 1] = positions[i + 1]
		out[i + 2] = positions[i + 2]
		out[i + ci] = 2 * center - positions[i + ci]
	}
	// Reflection inverts orientation; reverse each triangle's winding.
	const src = indices
	const flipped = new Uint32Array(src.length)
	for (let f = 0; f < src.length; f += 3) {
		flipped[f] = src[f]
		flipped[f + 1] = src[f + 2]
		flipped[f + 2] = src[f + 1]
	}
	return { positions: out, indices: flipped }
}

/**
 * Weld coincident vertices and drop degenerate triangles.
 * @param {Float32Array} positions
 * @param {Uint32Array|number[]} indices
 * @param {number} [epsilon=1e-5]
 */
export function autoRepair(positions, indices, epsilon = 1e-5) {
	const quant = (v) => Math.round(v / epsilon)
	const vertMap = new Map()
	const newPositions = []
	const remap = []

	for (let i = 0; i < positions.length; i += 3) {
		const key = `${quant(positions[i])},${quant(positions[i + 1])},${quant(positions[i + 2])}`
		if (!vertMap.has(key)) {
			const idx = newPositions.length / 3
			vertMap.set(key, idx)
			newPositions.push(positions[i], positions[i + 1], positions[i + 2])
		}
		remap[i / 3] = vertMap.get(key)
	}

	const newIndices = []
	const triCount = indices.length / 3
	let removedDegenerate = 0
	for (let f = 0; f < triCount; f++) {
		const a = remap[indices[3 * f]]
		const b = remap[indices[3 * f + 1]]
		const c = remap[indices[3 * f + 2]]
		if (a === b || b === c || a === c) {
			removedDegenerate++
			continue
		}
		const posArr = newPositions
		const ax = posArr[3 * a]
		const ay = posArr[3 * a + 1]
		const az = posArr[3 * a + 2]
		const bx = posArr[3 * b]
		const by = posArr[3 * b + 1]
		const bz = posArr[3 * b + 2]
		const cx = posArr[3 * c]
		const cy = posArr[3 * c + 1]
		const cz = posArr[3 * c + 2]
		const e1x = bx - ax
		const e1y = by - ay
		const e1z = bz - az
		const e2x = cx - ax
		const e2y = cy - ay
		const e2z = cz - az
		const area2 = Math.hypot(
			e1y * e2z - e1z * e2y,
			e1z * e2x - e1x * e2z,
			e1x * e2y - e1y * e2x,
		)
		if (area2 < epsilon) {
			removedDegenerate++
			continue
		}
		newIndices.push(a, b, c)
	}

	// Detach non-manifold fins (edges shared by >2 tris) so the geometry stops
	// being rejected as non-manifold; this also opens gaps the hole-fill closes.
	const splitEdges = splitNonManifoldEdges(newPositions, newIndices)

	// Fill boundary holes: any edge used by exactly one triangle is a boundary
	// edge; chain them into loops and cap each (fan for small, centroid-fan for
	// large). Run twice so gaps opened by the non-manifold split also close.
	let filledTris = fillBoundaryHoles(newPositions, newIndices)
	if (splitEdges) {
		filledTris += fillBoundaryHoles(newPositions, newIndices)
	}

	const welded = positions.length / 3 - (newPositions.length / 3)
	return {
		positions: new Float32Array(newPositions),
		indices: new Uint32Array(newIndices),
		stats: {
			weldedVertices: Math.max(0, welded),
			removedDegenerate,
			filledTriangles: filledTris,
			splitNonManifold: splitEdges,
		},
	}
}

/**
 * Close boundary holes in an indexed mesh in place (mutates `indices`).
 * Directed boundary edges (used once) are chained into loops and each loop is
 * capped with a triangle fan. Large/complex loops are skipped to avoid
 * self-intersecting fills. Returns the number of triangles added.
 * @param {number[]} positions
 * @param {number[]} indices
 * @param {number} [maxLoop] largest hole (in edges) to attempt
 * @returns {number}
 */
export function fillBoundaryHoles(positions, indices, maxLoop = 2000) {
	// Directed edge count: +1 for (a,b), so a boundary edge has net use 1 in one
	// direction. Track directed boundary edges as next[from] = to.
	const dirCount = new Map()
	const triCount = indices.length / 3
	const dkey = (a, b) => a * 0x100000000 + b
	for (let f = 0; f < triCount; f++) {
		const a = indices[3 * f]
		const b = indices[3 * f + 1]
		const c = indices[3 * f + 2]
		for (const [e0, e1] of [[a, b], [b, c], [c, a]]) {
			// undirected pairing: a boundary edge appears once total
			const kFwd = dkey(e0, e1)
			const kRev = dkey(e1, e0)
			if (dirCount.has(kRev)) {
				dirCount.delete(kRev) // interior edge — cancels out
			} else {
				dirCount.set(kFwd, [e0, e1])
			}
		}
	}
	if (dirCount.size === 0) {
		return 0
	}
	// Build adjacency from the leftover boundary (directed) edges.
	const next = new Map()
	for (const [, [from, to]] of dirCount) {
		next.set(from, to)
	}
	const visited = new Set()
	let added = 0
	for (const start of next.keys()) {
		if (visited.has(start)) {
			continue
		}
		const loop = []
		let cur = start
		let guard = 0
		while (cur !== undefined && !visited.has(cur) && guard <= maxLoop + 1) {
			visited.add(cur)
			loop.push(cur)
			cur = next.get(cur)
			guard++
			if (cur === start) {
				break
			}
		}
		// Only cap a genuine closed loop of manageable size.
		if (cur === start && loop.length >= 3 && loop.length <= maxLoop) {
			if (loop.length <= 8) {
				// Small hole → simple triangle fan from the first vertex.
				for (let i = 1; i < loop.length - 1; i++) {
					indices.push(loop[0], loop[i], loop[i + 1])
					added++
				}
			} else {
				// Larger hole → add a centroid vertex and fan around it. A flat
				// fan from one corner self-intersects on big, non-convex loops;
				// a centroid fan stays well-formed and closes the surface.
				let cxSum = 0
				let cySum = 0
				let czSum = 0
				for (const v of loop) {
					cxSum += positions[3 * v]
					cySum += positions[3 * v + 1]
					czSum += positions[3 * v + 2]
				}
				const centerIdx = positions.length / 3
				positions.push(cxSum / loop.length, cySum / loop.length, czSum / loop.length)
				for (let i = 0; i < loop.length; i++) {
					const a = loop[i]
					const b = loop[(i + 1) % loop.length]
					indices.push(centerIdx, a, b)
					added++
				}
			}
		}
	}
	return added
}

/**
 * Split non-manifold edges (shared by >2 triangles) by duplicating the offending
 * vertices per-triangle so each fin becomes its own geometry. This does not make
 * the mesh watertight but stops the engine rejecting it as non-manifold, and lets
 * the boundary-hole pass then close the resulting gaps.
 * Mutates `positions` and `indices`; returns the count of edges split.
 * @param {number[]} positions
 * @param {number[]} indices
 * @returns {number}
 */
export function splitNonManifoldEdges(positions, indices) {
	const triCount = indices.length / 3
	const ukey = (a, b) => (a < b ? a * 0x100000000 + b : b * 0x100000000 + a)
	// Count triangles per undirected edge.
	const edgeTris = new Map()
	for (let f = 0; f < triCount; f++) {
		const a = indices[3 * f]
		const b = indices[3 * f + 1]
		const c = indices[3 * f + 2]
		for (const [e0, e1] of [[a, b], [b, c], [c, a]]) {
			const k = ukey(e0, e1)
			const arr = edgeTris.get(k)
			if (arr) {
				arr.push(f)
			} else {
				edgeTris.set(k, [f])
			}
		}
	}
	// Vertices touching a non-manifold edge (>2 triangles).
	const badVerts = new Set()
	let split = 0
	for (const [, tris] of edgeTris) {
		if (tris.length > 2) {
			split++
			const f = tris[0]
			badVerts.add(indices[3 * f])
			badVerts.add(indices[3 * f + 1])
			badVerts.add(indices[3 * f + 2])
		}
	}
	if (!split) {
		return 0
	}
	// Duplicate bad vertices per referencing triangle so the fins detach.
	for (let f = 0; f < triCount; f++) {
		for (let k = 0; k < 3; k++) {
			const vi = indices[3 * f + k]
			if (badVerts.has(vi)) {
				const nv = positions.length / 3
				positions.push(positions[3 * vi], positions[3 * vi + 1], positions[3 * vi + 2])
				indices[3 * f + k] = nv
			}
		}
	}
	return split
}

/**
 * @param {ArrayBuffer} buf
 * @returns {{ positions: Float32Array, indices: Uint32Array }}
 */
export function parseStlToMesh(buf) {
	const bytes = new Uint8Array(buf)
	const head = new TextDecoder('ascii').decode(bytes.slice(0, 5)).toLowerCase()
	if (head === 'solid') {
		return parseAsciiStlToMesh(buf)
	}
	if (buf.byteLength < 84) {
		throw new Error('STL too small')
	}
	const dv = new DataView(buf)
	const triCount = dv.getUint32(80, true)
	const positions = []
	const indices = []
	let off = 84
	for (let f = 0; f < triCount; f++) {
		off += 12
		const base = positions.length / 3
		for (let v = 0; v < 3; v++) {
			positions.push(dv.getFloat32(off, true))
			off += 4
			positions.push(dv.getFloat32(off, true))
			off += 4
			positions.push(dv.getFloat32(off, true))
			off += 4
			indices.push(base + v)
		}
		off += 2
	}
	return {
		positions: new Float32Array(positions),
		indices: new Uint32Array(indices),
	}
}

/**
 * @param {ArrayBuffer} buf
 */
function parseAsciiStlToMesh(buf) {
	const text = new TextDecoder('utf-8', { fatal: false }).decode(buf)
	const vertexRe = /^\s*vertex\s+([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s+([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s+([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*$/gim
	const positions = []
	const indices = []
	let match
	while ((match = vertexRe.exec(text)) !== null) {
		const idx = positions.length / 3
		positions.push(Number(match[1]), Number(match[2]), Number(match[3]))
		if (idx % 3 === 2) {
			indices.push(idx - 2, idx - 1, idx)
		}
	}
	if (indices.length < 3) {
		throw new Error('ASCII STL: no triangles parsed')
	}
	return {
		positions: new Float32Array(positions),
		indices: new Uint32Array(indices),
	}
}
