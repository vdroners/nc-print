/**
 * Pure helpers for the live temperature graph (WS10). Framework-free so they
 * can be unit-tested without mounting Vue or Pinia.
 */

/**
 * Material presets → heater targets (°C). `off` cools everything down.
 * @type {Record<string, {label: string, nozzle: number, bed: number}>}
 */
export const TEMP_PRESETS = {
	pla: { label: 'PLA', nozzle: 210, bed: 60 },
	petg: { label: 'PETG', nozzle: 240, bed: 80 },
	abs: { label: 'ABS', nozzle: 250, bed: 100 },
	off: { label: 'Cooldown', nozzle: 0, bed: 0 },
}

/**
 * Map a preset key to `{ nozzle, bed }` targets for setTemperature().
 * @param {string} key preset id (case-insensitive)
 * @returns {{nozzle: number, bed: number}|null}
 */
export function presetToTargets(key) {
	const preset = TEMP_PRESETS[String(key || '').toLowerCase()]
	if (!preset) {
		return null
	}
	return { nozzle: preset.nozzle, bed: preset.bed }
}

/**
 * Human label for a raw Moonraker sensor key.
 * @param {string} key e.g. 'extruder', 'heater_bed', 'temperature_sensor chamber'
 * @returns {string}
 */
export function sensorLabel(key) {
	if (key === 'extruder') {
		return 'Nozzle'
	}
	if (/^extruder\d+$/.test(key)) {
		return `Nozzle ${key.slice(8)}`
	}
	if (key === 'heater_bed') {
		return 'Bed'
	}
	const prefixes = ['temperature_sensor ', 'temperature_fan ', 'heater_generic ']
	for (const p of prefixes) {
		if (key.startsWith(p)) {
			return key.slice(p.length)
		}
	}
	return key
}

/**
 * True when a sensor key can be a controllable heater (has a target).
 * @param {string} key
 * @returns {boolean}
 */
export function isHeaterKey(key) {
	return key === 'heater_bed'
		|| key === 'extruder'
		|| /^extruder\d+$/.test(key)
		|| key.startsWith('heater_generic ')
}

/**
 * Parse a Moonraker `server/temperature_store` payload into series arrays.
 * Accepts both the `{result: {...}}` proxy envelope and a bare object.
 *
 * @param {object} payload raw response
 * @returns {Array<{key: string, label: string, isHeater: boolean, temperatures: number[], targets: number[]}>}
 */
export function parseTemperatureStore(payload) {
	if (!payload || typeof payload !== 'object') {
		return []
	}
	const store = payload.result && typeof payload.result === 'object'
		? payload.result
		: payload
	const out = []
	for (const [key, val] of Object.entries(store)) {
		if (!val || typeof val !== 'object') {
			continue
		}
		const temps = Array.isArray(val.temperatures) ? val.temperatures.map(Number) : []
		if (temps.length === 0) {
			continue
		}
		out.push({
			key,
			label: sensorLabel(key),
			isHeater: isHeaterKey(key),
			temperatures: temps,
			targets: Array.isArray(val.targets) ? val.targets.map(Number) : [],
		})
	}
	// Deterministic order: extruder(s), bed, then extra sensors alphabetically.
	const rank = (k) => (k.startsWith('extruder') ? 0 : k === 'heater_bed' ? 1 : 2)
	out.sort((a, b) => rank(a.key) - rank(b.key) || a.key.localeCompare(b.key))
	return out
}

/**
 * Build an SVG polyline `points` string from a numeric series, scaled into a
 * viewbox. Downsamples to at most `maxPoints` for render cost.
 *
 * @param {number[]} series
 * @param {object} opts
 * @param {number} opts.width viewbox width
 * @param {number} opts.height viewbox height
 * @param {number} opts.min domain min (°C)
 * @param {number} opts.max domain max (°C)
 * @param {number} [opts.maxPoints]
 * @returns {string}
 */
export function seriesToPoints(series, { width, height, min, max, maxPoints = 240 }) {
	if (!Array.isArray(series) || series.length === 0) {
		return ''
	}
	const span = Math.max(1e-6, max - min)
	const data = series.length > maxPoints
		? decimate(series, maxPoints)
		: series
	const n = data.length
	return data.map((v, i) => {
		const x = n === 1 ? width : (i / (n - 1)) * width
		const clamped = Math.max(min, Math.min(max, Number(v)))
		const y = height - ((clamped - min) / span) * height
		return `${x.toFixed(1)},${y.toFixed(1)}`
	}).join(' ')
}

/**
 * Uniformly decimate a series to `target` points (keeps first + last).
 * @param {number[]} series
 * @param {number} target
 * @returns {number[]}
 */
export function decimate(series, target) {
	if (series.length <= target) {
		return series.slice()
	}
	const stride = (series.length - 1) / (target - 1)
	const out = []
	for (let i = 0; i < target; i++) {
		out.push(series[Math.round(i * stride)])
	}
	return out
}

/**
 * Domain (min/max °C) covering all series with a little headroom.
 * @param {Array<{temperatures: number[], targets: number[]}>} sensors
 * @returns {{min: number, max: number}}
 */
export function temperatureDomain(sensors) {
	let max = 0
	for (const s of sensors) {
		for (const t of s.temperatures) {
			if (Number.isFinite(t) && t > max) {
				max = t
			}
		}
		for (const t of s.targets) {
			if (Number.isFinite(t) && t > max) {
				max = t
			}
		}
	}
	return { min: 0, max: Math.max(60, Math.ceil((max + 10) / 10) * 10) }
}
