/**
 * Pure helpers for bed-mesh visualization (WS12). Framework-free.
 */

/**
 * Extract the bed_mesh object from a `printer/objects/query` response.
 * Accepts `{result: {status: {bed_mesh}}}`, `{status: {bed_mesh}}`, or a bare
 * bed_mesh object.
 * @param {object} payload
 * @returns {object|null}
 */
function extractBedMesh(payload) {
	if (!payload || typeof payload !== 'object') {
		return null
	}
	const status = payload.result?.status ?? payload.status ?? payload
	if (status?.bed_mesh && typeof status.bed_mesh === 'object') {
		return status.bed_mesh
	}
	// Already the bed_mesh object?
	if (Array.isArray(status?.probed_matrix) || Array.isArray(status?.mesh_matrix)) {
		return status
	}
	return null
}

/**
 * Parse a bed_mesh object into a normalized model with matrix + range stats.
 * @param {object} payload
 * @returns {{matrix: number[][], rows: number, cols: number, min: number, max: number, range: number, mean: number, profileName: string, profiles: string[]}|null}
 */
export function parseBedMesh(payload) {
	const mesh = extractBedMesh(payload)
	if (!mesh) {
		return null
	}
	// Prefer Klipper's interpolated mesh_matrix (finer grid) over the coarse
	// raw probed_matrix, so the heatmap shows more detail.
	const raw = Array.isArray(mesh.mesh_matrix) && mesh.mesh_matrix.length
		? mesh.mesh_matrix
		: Array.isArray(mesh.probed_matrix) ? mesh.probed_matrix : []
	const matrix = raw
		.filter(Array.isArray)
		.map((row) => row.map(Number).filter(Number.isFinite))
		.filter((row) => row.length > 0)
	if (matrix.length === 0) {
		return null
	}
	let min = Infinity
	let max = -Infinity
	let sum = 0
	let count = 0
	for (const row of matrix) {
		for (const v of row) {
			if (v < min) {
				min = v
			}
			if (v > max) {
				max = v
			}
			sum += v
			count++
		}
	}
	const profiles = mesh.profiles && typeof mesh.profiles === 'object'
		? Object.keys(mesh.profiles)
		: []
	return {
		matrix,
		rows: matrix.length,
		cols: matrix[0].length,
		min,
		max,
		range: max - min,
		mean: count > 0 ? sum / count : 0,
		profileName: String(mesh.profile_name ?? ''),
		profiles,
	}
}

/**
 * Bilinearly upsample a mesh matrix to a finer display grid so the heatmap
 * reads as a smooth surface rather than a few big blocks. A coarse N×M probe
 * grid becomes roughly `targetPerAxis` cells on its longest axis.
 * @param {number[][]} matrix
 * @param {number} [targetPerAxis] desired cells along the larger dimension
 * @returns {number[][]}
 */
export function interpolateMatrix(matrix, targetPerAxis = 24) {
	if (!Array.isArray(matrix) || matrix.length === 0 || !Array.isArray(matrix[0])) {
		return matrix
	}
	const rows = matrix.length
	const cols = matrix[0].length
	if (rows < 2 || cols < 2) {
		return matrix
	}
	// Only upsample; never downsample below the source resolution.
	const outRows = Math.max(rows, Math.min(targetPerAxis, Math.round((rows / Math.max(rows, cols)) * targetPerAxis) || rows))
	const outCols = Math.max(cols, Math.min(targetPerAxis, Math.round((cols / Math.max(rows, cols)) * targetPerAxis) || cols))
	const out = []
	for (let r = 0; r < outRows; r++) {
		const fr = (r / (outRows - 1)) * (rows - 1)
		const r0 = Math.floor(fr)
		const r1 = Math.min(rows - 1, r0 + 1)
		const dr = fr - r0
		const rowOut = []
		for (let c = 0; c < outCols; c++) {
			const fc = (c / (outCols - 1)) * (cols - 1)
			const c0 = Math.floor(fc)
			const c1 = Math.min(cols - 1, c0 + 1)
			const dc = fc - c0
			const v00 = matrix[r0][c0]
			const v01 = matrix[r0][c1]
			const v10 = matrix[r1][c0]
			const v11 = matrix[r1][c1]
			const top = v00 + (v01 - v00) * dc
			const bot = v10 + (v11 - v10) * dc
			rowOut.push(top + (bot - top) * dr)
		}
		out.push(rowOut)
	}
	return out
}

/**
 * Map a normalized value (0..1) to a blue→green→red heat color.
 * @param {number} t
 * @returns {string} rgb() color
 */
export function heatColor(t) {
	const x = Math.max(0, Math.min(1, Number(t) || 0))
	// 0 → blue (low), 0.5 → green (nominal), 1 → red (high)
	let r
	let g
	let b
	if (x < 0.5) {
		const k = x / 0.5
		r = Math.round(30 + k * (30 - 30))
		g = Math.round(90 + k * (200 - 90))
		b = Math.round(220 - k * (220 - 90))
	} else {
		const k = (x - 0.5) / 0.5
		r = Math.round(30 + k * (230 - 30))
		g = Math.round(200 - k * (200 - 70))
		b = Math.round(90 - k * (90 - 60))
	}
	return `rgb(${r}, ${g}, ${b})`
}

/**
 * Flatten a mesh matrix into heatmap cells with normalized value + color.
 * Row 0 is the front of the bed; the caller may flip for display.
 * @param {number[][]} matrix
 * @param {{min: number, max: number}} range
 * @returns {Array<{row: number, col: number, value: number, t: number, color: string}>}
 */
export function normalizeMeshCells(matrix, { min, max } = {}) {
	if (!Array.isArray(matrix) || matrix.length === 0) {
		return []
	}
	let lo = min
	let hi = max
	if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
		lo = Infinity
		hi = -Infinity
		for (const row of matrix) {
			for (const v of row) {
				if (v < lo) {
					lo = v
				}
				if (v > hi) {
					hi = v
				}
			}
		}
	}
	const span = Math.max(1e-9, hi - lo)
	const cells = []
	for (let r = 0; r < matrix.length; r++) {
		for (let c = 0; c < matrix[r].length; c++) {
			const value = matrix[r][c]
			const t = (value - lo) / span
			cells.push({ row: r, col: c, value, t, color: heatColor(t) })
		}
	}
	return cells
}
