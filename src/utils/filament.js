/**
 * Pure helpers for filament management (WS14): runout sensors, Spoolman
 * spools, and length→mass→cost math. Framework-free for unit testing.
 */

/** Default 1.75 mm PLA-ish assumptions when the slicer/profile omit them. */
export const DEFAULT_DIAMETER_MM = 1.75
export const DEFAULT_DENSITY_G_CM3 = 1.24

/**
 * Convert a filament length (mm) to mass (grams).
 * mass = π·(d/2)²·length(mm) / 1000 (mm³→cm³) · density
 * @param {number} lengthMm
 * @param {number} [diameterMm]
 * @param {number} [densityGcm3]
 * @returns {number} grams (0 for invalid input)
 */
export function filamentMassG(lengthMm, diameterMm = DEFAULT_DIAMETER_MM, densityGcm3 = DEFAULT_DENSITY_G_CM3) {
	const len = Number(lengthMm)
	const d = Number(diameterMm)
	const rho = Number(densityGcm3)
	if (!Number.isFinite(len) || len <= 0 || !Number.isFinite(d) || d <= 0 || !Number.isFinite(rho) || rho <= 0) {
		return 0
	}
	const radius = d / 2
	const areaMm2 = Math.PI * radius * radius
	const volumeCm3 = (areaMm2 * len) / 1000
	return volumeCm3 * rho
}

/**
 * Compute filament cost + mass from a length and material properties.
 * @param {number} lengthMm
 * @param {object} [opts]
 * @param {number} [opts.diameter]
 * @param {number} [opts.density]
 * @param {number} [opts.pricePerKg] currency per kg
 * @returns {{massG: number, cost: number|null}}
 */
export function filamentCost(lengthMm, { diameter = DEFAULT_DIAMETER_MM, density = DEFAULT_DENSITY_G_CM3, pricePerKg } = {}) {
	const massG = filamentMassG(lengthMm, diameter, density)
	const price = Number(pricePerKg)
	const cost = Number.isFinite(price) && price > 0 ? (massG / 1000) * price : null
	return { massG, cost }
}

/**
 * Parse filament runout / motion sensors from a printer objects status map.
 * Keys look like `filament_switch_sensor e0` or `filament_motion_sensor x`.
 * @param {object} payload printer/objects/query response, status, or bare map
 * @returns {Array<{name: string, type: string, enabled: boolean, detected: boolean}>}
 */
export function parseRunoutSensors(payload) {
	const status = payload?.result?.status ?? payload?.status ?? payload ?? {}
	const out = []
	for (const [key, val] of Object.entries(status)) {
		if (!val || typeof val !== 'object') {
			continue
		}
		let type = null
		if (key.startsWith('filament_switch_sensor ')) {
			type = 'switch'
		} else if (key.startsWith('filament_motion_sensor ')) {
			type = 'motion'
		} else {
			continue
		}
		out.push({
			name: key.split(' ').slice(1).join(' '),
			type,
			enabled: val.enabled !== false,
			detected: val.filament_detected !== false,
		})
	}
	return out
}

/**
 * Parse the active spool id from Moonraker `server/spoolman/status`.
 * @param {object} payload
 * @returns {number|null}
 */
export function parseActiveSpoolId(payload) {
	const root = payload?.result ?? payload ?? {}
	const id = root.spool_id
	return Number.isFinite(Number(id)) && id != null ? Number(id) : null
}

/**
 * Parse a Spoolman spool list (array of spool records) into a compact model.
 * @param {object|Array} payload
 * @returns {Array<{id: number, name: string, material: string, remainingG: number|null, usedG: number|null, color: string|null}>}
 */
export function parseSpools(payload) {
	const list = Array.isArray(payload)
		? payload
		: Array.isArray(payload?.result) ? payload.result
			: Array.isArray(payload?.spools) ? payload.spools : []
	return list.map((s) => {
		const filament = s.filament ?? {}
		return {
			id: Number(s.id),
			name: String(filament.name ?? s.name ?? `Spool ${s.id}`),
			material: String(filament.material ?? ''),
			remainingG: Number.isFinite(Number(s.remaining_weight)) ? Number(s.remaining_weight) : null,
			usedG: Number.isFinite(Number(s.used_weight)) ? Number(s.used_weight) : null,
			color: filament.color_hex ? `#${String(filament.color_hex).replace(/^#/, '')}` : null,
		}
	})
}
