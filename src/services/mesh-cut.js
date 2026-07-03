/**
 * Client-side plane cut for indexed triangle meshes.
 * Splits geometry against an axis-aligned plane, keeps one side, and
 * optionally caps the exposed cross-section.
 *
 * Cap triangulation uses a centroid fan over the intersection ring sorted by
 * angle in the plane. This is exact for convex cross-sections and best-effort
 * for concave ones (documented limitation — robust capping needs contour-loop
 * extraction, deferred).
 */

const AXIS_INDEX = { x: 0, y: 1, z: 2 }

/**
 * @param {Float32Array|number[]} positions flat xyz
 * @param {Uint32Array|number[]} indices
 * @param {{ axis?: 'x'|'y'|'z', position01?: number, offset?: number, keep?: 'top'|'bottom', cap?: boolean }} [options]
 * @returns {{ positions: Float32Array, indices: Uint32Array, offset: number }|null}
 */
export function cutMeshByPlane(positions, indices, options = {}) {
	const axis = AXIS_INDEX[options.axis] !== undefined ? options.axis : 'z'
	const ci = AXIS_INDEX[axis]
	const keep = options.keep === 'top' ? 'top' : 'bottom'
	const sign = keep === 'top' ? 1 : -1
	const cap = options.cap !== false

	// Resolve the plane offset along the axis.
	let min = Infinity
	let max = -Infinity
	for (let i = ci; i < positions.length; i += 3) {
		if (positions[i] < min) {
			min = positions[i]
		}
		if (positions[i] > max) {
			max = positions[i]
		}
	}
	let offset
	if (Number.isFinite(options.offset)) {
		offset = options.offset
	} else {
		const t = Math.min(Math.max(Number.isFinite(options.position01) ? options.position01 : 0.5, 0), 1)
		offset = min + t * (max - min)
	}

	const dist = (v) => sign * (v[ci] - offset)
	const vertAt = (idx) => [positions[3 * idx], positions[3 * idx + 1], positions[3 * idx + 2]]
	const lerp = (a, b, t) => [
		a[0] + (b[0] - a[0]) * t,
		a[1] + (b[1] - a[1]) * t,
		a[2] + (b[2] - a[2]) * t,
	]

	const out = []
	const capPts = []
	const pushTri = (v0, v1, v2) => {
		out.push(v0[0], v0[1], v0[2], v1[0], v1[1], v1[2], v2[0], v2[1], v2[2])
	}

	const triCount = indices.length / 3
	for (let f = 0; f < triCount; f++) {
		const tri = [
			vertAt(indices[3 * f]),
			vertAt(indices[3 * f + 1]),
			vertAt(indices[3 * f + 2]),
		]
		const d = [dist(tri[0]), dist(tri[1]), dist(tri[2])]
		const poly = []
		const crossings = []
		for (let i = 0; i < 3; i++) {
			const cur = tri[i]
			const nxt = tri[(i + 1) % 3]
			const dc = d[i]
			const dn = d[(i + 1) % 3]
			if (dc >= 0) {
				poly.push(cur)
			}
			if ((dc >= 0) !== (dn >= 0)) {
				const t = dc / (dc - dn)
				const p = lerp(cur, nxt, t)
				poly.push(p)
				crossings.push(p)
			}
		}
		for (let i = 1; i + 1 < poly.length; i++) {
			pushTri(poly[0], poly[i], poly[i + 1])
		}
		if (crossings.length === 2) {
			capPts.push(crossings[0], crossings[1])
		}
	}

	if (!out.length) {
		return null
	}

	if (cap && capPts.length >= 3) {
		buildCap(capPts, ci, sign, pushTri)
	}

	const posArr = new Float32Array(out)
	const idxArr = new Uint32Array(posArr.length / 3)
	for (let i = 0; i < idxArr.length; i++) {
		idxArr[i] = i
	}
	return { positions: posArr, indices: idxArr, offset }
}

/**
 * Centroid-fan cap of the cut cross-section.
 * @param {number[][]} capPts [x,y,z] endpoints of cut segments
 * @param {number} ci axis coordinate index
 * @param {number} sign kept-side sign
 * @param {(a:number[], b:number[], c:number[]) => void} pushTri
 */
function buildCap(capPts, ci, sign, pushTri) {
	const u = (ci + 1) % 3
	const v = (ci + 2) % 3
	// Dedup ring points.
	const seen = new Set()
	const pts = []
	const q = 1e-3
	for (const p of capPts) {
		const key = `${Math.round(p[u] / q)},${Math.round(p[v] / q)}`
		if (seen.has(key)) {
			continue
		}
		seen.add(key)
		pts.push(p)
	}
	if (pts.length < 3) {
		return
	}
	let cu = 0
	let cv = 0
	let planeCoord = 0
	for (const p of pts) {
		cu += p[u]
		cv += p[v]
		planeCoord += p[ci]
	}
	cu /= pts.length
	cv /= pts.length
	planeCoord /= pts.length
	pts.sort((a, b) => Math.atan2(a[v] - cv, a[u] - cu) - Math.atan2(b[v] - cv, b[u] - cu))
	const center = []
	center[ci] = planeCoord
	center[u] = cu
	center[v] = cv
	// The cap should face the removed side (opposite the kept sign along axis).
	// Determine fan winding from the axis order (u,v) vs desired normal.
	// (u -> v -> ci) is a right-handed basis, so a CCW fan in (u,v) yields a
	// +axis normal; flip when the kept side is +axis (sign > 0).
	const flip = sign > 0
	for (let i = 0; i < pts.length; i++) {
		const a = pts[i]
		const b = pts[(i + 1) % pts.length]
		if (flip) {
			pushTri(center, b, a)
		} else {
			pushTri(center, a, b)
		}
	}
}
