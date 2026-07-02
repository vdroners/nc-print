/**
 * Pure formatters for the 3D viewport overlays (bed legend, etc.).
 */

/**
 * Format the bed footprint (X x Y) from a build-volume triple.
 * @param {Array<number>} volume [x, y, z] in mm
 * @returns {string} e.g. "220×220"
 */
export function formatBedDimensions(volume) {
	const [x, y] = Array.isArray(volume) ? volume : []
	const bx = Number.isFinite(x) ? Math.round(x) : 0
	const by = Number.isFinite(y) ? Math.round(y) : 0
	return `${bx}×${by}`
}

/**
 * Full bed legend line for the viewport corner readout.
 * @param {Array<number>} volume [x, y, z] in mm
 * @returns {string} e.g. "Bed 220×220 mm · origin front-left"
 */
export function formatBedLegend(volume) {
	return `Bed ${formatBedDimensions(volume)} mm · origin front-left`
}
