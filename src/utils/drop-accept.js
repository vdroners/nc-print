/**
 * File-type classification for the full-screen drag-drop overlay. Pure +
 * framework-free so it's unit-testable and shared by the overlay component.
 *
 * Models (.stl/.3mf/.obj) load into the Prepare tab; g-code (.gcode/.gcode.gz)
 * routes to the Print tab's upload path. Everything else is unsupported.
 */

const MODEL_EXT = /\.(stl|3mf|obj)$/i
const GCODE_EXT = /\.gcode(\.gz)?$/i

/** @param {string} name @returns {boolean} */
export function isAcceptedModel(name) {
	return MODEL_EXT.test(String(name || '').trim())
}

/** @param {string} name @returns {boolean} */
export function isGcode(name) {
	return GCODE_EXT.test(String(name || '').trim())
}

/**
 * @param {string} name
 * @returns {'model'|'gcode'|'unsupported'}
 */
export function classifyDrop(name) {
	const n = String(name || '').trim()
	if (isAcceptedModel(n)) {
		return 'model'
	}
	if (isGcode(n)) {
		return 'gcode'
	}
	return 'unsupported'
}

/** Human list of accepted extensions, for the overlay hint. */
export const ACCEPTED_LABEL = '.stl · .3mf · .obj · .gcode'
