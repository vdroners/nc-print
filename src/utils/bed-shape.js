/**
 * Parse an OrcaSlicer/Creality-Print machine bed definition into a
 * [width, depth, height] build volume in mm. Pure + framework-free so the store
 * getter and its unit tests share it.
 *
 * The engine stores the bed as `printable_area` — a polygon of "XxY" corner
 * points, e.g. "0x0,300x0,300x300,0x300" (comma-separated, or already an array),
 * plus a scalar `printable_height`. We take the bounding extent of the polygon
 * for X/Y and the height for Z.
 */

/**
 * @param {string|string[]} area  printable_area polygon ("0x0,300x0,…" or [...])
 * @param {number|string} [height] printable_height (mm)
 * @returns {[number, number, number] | null} [x, y, z] or null if unparseable
 */
export function parsePrintableArea(area, height) {
	const pts = normalizePoints(area)
	if (!pts.length) {
		return null
	}
	let maxX = -Infinity
	let maxY = -Infinity
	let minX = Infinity
	let minY = Infinity
	for (const [x, y] of pts) {
		if (x > maxX) { maxX = x }
		if (y > maxY) { maxY = y }
		if (x < minX) { minX = x }
		if (y < minY) { minY = y }
	}
	const w = maxX - minX
	const d = maxY - minY
	if (!(w > 0) || !(d > 0)) {
		return null
	}
	const z = Number(height)
	return [w, d, Number.isFinite(z) && z > 0 ? z : Math.max(w, d)]
}

/**
 * @param {string|string[]} area
 * @returns {Array<[number, number]>}
 */
function normalizePoints(area) {
	let raw
	if (Array.isArray(area)) {
		raw = area
	} else if (typeof area === 'string') {
		raw = area.split(',')
	} else {
		return []
	}
	const out = []
	for (const token of raw) {
		const m = String(token).trim().match(/^(-?\d+(?:\.\d+)?)\s*x\s*(-?\d+(?:\.\d+)?)$/i)
		if (m) {
			out.push([parseFloat(m[1]), parseFloat(m[2])])
		}
	}
	return out
}
