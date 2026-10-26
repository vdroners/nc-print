/**
 * Build-plate grid and volume-cage line positions for the Prepare viewport.
 *
 * Every XY coordinate stays inside the plate rectangle [0, bx] × [0, by].
 * The previous GridHelper used Math.max(bx, by) as a square, so a non-square
 * plate grew past the bed and those axis lines ran off the top of the view.
 * Positions are plain numbers (no Three.js) so the clip can be unit-tested
 * without WebGL. Z is up; the grid lies on the plate.
 */

const GRID_STEP_MM = 10

/**
 * Stops along one plate axis, including both ends. Spacing is ~10 mm and the
 * last stop is exactly `length`, so the grid meets the plate edge and does
 * not continue past it.
 * @param {number} length
 * @param {number} step
 * @returns {number[]}
 */
function axisStops(length, step) {
	const stops = [0]
	if (!(length > 0)) {
		return stops
	}
	const n = Math.max(1, Math.min(400, Math.round(length / step)))
	for (let i = 1; i < n; i++) {
		stops.push((length * i) / n)
	}
	stops.push(length)
	return stops
}

/**
 * Twelve edges of the build volume [0, bx] × [0, by] × [0, bz].
 * @param {number} bx
 * @param {number} by
 * @param {number} bz
 * @returns {number[]}
 */
function boxEdges(bx, by, bz) {
	const corners = [
		[0, 0, 0], [bx, 0, 0], [bx, by, 0], [0, by, 0],
		[0, 0, bz], [bx, 0, bz], [bx, by, bz], [0, by, bz],
	]
	const pairs = [
		[0, 1], [1, 2], [2, 3], [3, 0],
		[4, 5], [5, 6], [6, 7], [7, 4],
		[0, 4], [1, 5], [2, 6], [3, 7],
	]
	const out = []
	for (const [a, b] of pairs) {
		out.push(...corners[a], ...corners[b])
	}
	return out
}

/**
 * @param {number} bx
 * @param {number} by
 * @param {number} bz
 * @returns {{ grid: number[], edges: number[] }}
 *   Flat xyz endpoint pairs (two vertices per segment).
 */
export function bedGuidePositions(bx, by, bz) {
	const x = Number(bx)
	const y = Number(by)
	const z = Number(bz)
	const grid = []
	if (x > 0 && y > 0) {
		const xStops = axisStops(x, GRID_STEP_MM)
		const yStops = axisStops(y, GRID_STEP_MM)
		for (const yy of yStops) {
			grid.push(0, yy, 0.01, x, yy, 0.01)
		}
		for (const xx of xStops) {
			grid.push(xx, 0, 0.01, xx, y, 0.01)
		}
	}
	const edges = x > 0 && y > 0 && z > 0 ? boxEdges(x, y, z) : []
	return { grid, edges }
}

/**
 * World-space clip planes that keep fragments inside the plate XY, with a
 * small epsilon so lines that sit on the boundary are not shaved off.
 * Three.Plane distance is `normal · point + constant`; a point is kept when
 * that distance is >= 0.
 * @param {number} bx
 * @param {number} by
 * @param {number} [eps]
 * @returns {Array<{ normal: number[], constant: number }>}
 */
export function plateClipPlanes(bx, by, eps = 0.75) {
	const x = Number(bx) || 0
	const y = Number(by) || 0
	const e = Number(eps) > 0 ? Number(eps) : 0
	return [
		{ normal: [1, 0, 0], constant: e },
		{ normal: [-1, 0, 0], constant: x + e },
		{ normal: [0, 1, 0], constant: e },
		{ normal: [0, -1, 0], constant: y + e },
	]
}

/**
 * @param {number[]} point xyz
 * @param {Array<{ normal: number[], constant: number }>} planes
 * @returns {boolean}
 */
export function keptByPlateClip(point, planes) {
	const [x, y, z] = point
	return planes.every((p) => {
		const dist = p.normal[0] * x + p.normal[1] * y + p.normal[2] * z + p.constant
		return dist >= -1e-6
	})
}

/**
 * Empty-bed camera that keeps the whole volume cage inside a perspective view.
 * The previous fixed offset (`bx + 100`, `bz + 60`) left the top edges past
 * the top of the viewport. Named camera presets are unchanged.
 * @param {number} bx
 * @param {number} by
 * @param {number} bz
 * @param {{ aspect?: number, fovDeg?: number, margin?: number }} [opts]
 * @returns {{ position: number[], target: number[] }}
 */
export function emptyBedFrame(bx, by, bz, { aspect = 1, fovDeg = 40, margin = 1.35 } = {}) {
	const x = Number(bx) > 0 ? Number(bx) : 0
	const y = Number(by) > 0 ? Number(by) : 0
	const z = Number(bz) > 0 ? Number(bz) : 0
	const center = [x / 2, y / 2, z / 2]
	const radius = 0.5 * Math.hypot(x, y, z)
	const vFov = (fovDeg * Math.PI) / 180
	const safeAspect = Math.max(Number(aspect) || 1, 0.5)
	const hFov = 2 * Math.atan(Math.tan(vFov / 2) * safeAspect)
	const fitFov = Math.min(vFov, hFov)
	const dist = radius > 0 && fitFov > 0
		? (radius / Math.sin(fitFov / 2)) * margin
		: 400
	const len = Math.hypot(1, 1, 0.72)
	const dir = [1 / len, 1 / len, 0.72 / len]
	return {
		target: center,
		position: [
			center[0] + dir[0] * dist,
			center[1] + dir[1] * dist,
			center[2] + dir[2] * dist,
		],
	}
}

/**
 * @param {number[]} positions
 * @param {number} bx
 * @param {number} by
 * @returns {boolean}
 */
export function positionsInsidePlate(positions, bx, by) {
	for (let i = 0; i < positions.length; i += 3) {
		const x = positions[i]
		const y = positions[i + 1]
		if (x < -1e-6 || x > bx + 1e-6 || y < -1e-6 || y > by + 1e-6) {
			return false
		}
	}
	return true
}
