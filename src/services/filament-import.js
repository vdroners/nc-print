/**
 * Import an OrcaSlicer / Bambu Studio filament preset (.json) and map its keys to
 * the app's override form. Parses ENTIRELY in the browser — no upload, no new
 * adapter endpoint, no proxy-allowlist change, so there's zero added server
 * attack surface. Only a small whitelist of known filament keys is applied;
 * everything else is ignored.
 *
 * OrcaSlicer/Bambu presets store most values as arrays of strings
 * (e.g. "nozzle_temperature": ["220"]). We take index 0 and coerce.
 */

/** Reject anything larger than this (a filament preset is a few KB). */
export const MAX_IMPORT_BYTES = 256 * 1024

// Engine key → override form key. Filament-scoped values a preset legitimately
// carries. Multiple engine keys can map to the same form field (first present
// wins), e.g. the various per-plate bed temps → bedTemp.
const KEY_MAP = [
	['nozzle_temperature', 'nozzleTemp'],
	['hot_plate_temp', 'bedTemp'],
	['cool_plate_temp', 'bedTemp'],
	['textured_plate_temp', 'bedTemp'],
	['eng_plate_temp', 'bedTemp'],
	['fan_max_speed', 'fanSpeed'],
	['filament_retraction_length', 'retractionLength'],
	['retraction_length', 'retractionLength'],
	['filament_retraction_speed', 'retractionSpeed'],
	['retraction_speed', 'retractionSpeed'],
]

/** Take the scalar value from an Orca array-or-scalar preset field. */
function scalar(v) {
	if (Array.isArray(v)) {
		return v.length ? v[0] : undefined
	}
	return v
}

function toNumber(v) {
	const n = Number(scalar(v))
	return Number.isFinite(n) ? n : undefined
}

/**
 * @param {string|object} input raw JSON text or an already-parsed object
 * @returns {{ form: object, applied: string[], ignored: string[], warnings: string[] }}
 * @throws {Error} on oversize / invalid-JSON / non-object input
 */
export function parseOrcaFilamentJson(input) {
	let obj
	if (typeof input === 'string') {
		if (input.length > MAX_IMPORT_BYTES) {
			throw new Error(`File too large (max ${Math.round(MAX_IMPORT_BYTES / 1024)} KB)`)
		}
		try {
			obj = JSON.parse(input)
		} catch {
			throw new Error('Not valid JSON')
		}
	} else {
		obj = input
	}
	if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
		throw new Error('Expected a filament preset object')
	}

	const form = {}
	const applied = []
	const ignored = []
	const warnings = []
	const seenFormKeys = new Set()

	for (const [engineKey, formKey] of KEY_MAP) {
		if (!(engineKey in obj)) {
			continue
		}
		if (seenFormKeys.has(formKey)) {
			continue // an earlier engine key already filled this form field
		}
		const num = toNumber(obj[engineKey])
		if (num === undefined) {
			continue
		}
		form[formKey] = num
		seenFormKeys.add(formKey)
		applied.push(`${engineKey} → ${formKey}`)
	}

	// Everything present that we didn't map is ignored (reported, not applied).
	const mappedEngineKeys = new Set(KEY_MAP.map(([k]) => k))
	for (const k of Object.keys(obj)) {
		if (!mappedEngineKeys.has(k)) {
			ignored.push(k)
		}
	}

	if (!applied.length) {
		warnings.push('No recognised filament settings found in this file')
	}

	return { form, applied, ignored, warnings }
}
