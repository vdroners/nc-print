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
 * Heater target field while a job may be running.
 * Follow the live Moonraker target until the operator types.
 * A missing or non-positive target stays blank — never a material default.
 * @param {string} current
 * @param {unknown} live
 * @param {boolean} touched
 * @returns {string}
 */
export function followLiveTarget(current, live, touched) {
	if (touched) {
		return current == null ? '' : String(current)
	}
	const n = Number(live)
	if (!Number.isFinite(n) || n <= 0) {
		return ''
	}
	return String(Math.round(n))
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

/** Nozzle / bed sparkline window. Matches the "5 min" labels. */
export const SPARKLINE_WINDOW_MS = 5 * 60 * 1000

/**
 * Moonraker `server/temperature_store` keeps about one sample per second,
 * oldest first, newest last (20 minutes).
 */
export const TEMP_STORE_STEP_MS = 1000

/**
 * @param {unknown} value
 * @returns {number|null}
 */
function finiteTemp(value) {
	const n = Number(value)
	return Number.isFinite(n) ? n : null
}

/**
 * Turn a Moonraker temperature_store series into sparkline samples.
 * The newest sample is anchored at `now`, so a steady heater still fills
 * the window instead of collapsing to a single tick.
 *
 * @param {unknown[]} temperatures oldest → newest
 * @param {{now?: number, windowMs?: number, stepMs?: number}} [opts]
 * @returns {Array<{t: number, value: number}>}
 */
export function samplesFromTemperatureSeries(temperatures, opts = {}) {
	const now = Number.isFinite(opts.now) ? opts.now : Date.now()
	const windowMs = opts.windowMs ?? SPARKLINE_WINDOW_MS
	const stepMs = opts.stepMs ?? TEMP_STORE_STEP_MS
	if (!Array.isArray(temperatures) || stepMs <= 0 || windowMs <= 0) {
		return []
	}
	const maxCount = Math.max(1, Math.ceil(windowMs / stepMs))
	const tail = temperatures.slice(-maxCount)
	const start = now - (tail.length - 1) * stepMs
	const cutoff = now - windowMs
	const out = []
	for (let i = 0; i < tail.length; i++) {
		const value = finiteTemp(tail[i])
		if (value == null) {
			continue
		}
		const t = start + i * stepMs
		if (t >= cutoff) {
			out.push({ t, value })
		}
	}
	return out
}

/**
 * Append one live reading. The same °C at a later timestamp is kept — a
 * steady nozzle must still draw a line, not age out of the window.
 *
 * @param {Array<{t: number, value: number}>} samples
 * @param {unknown} value
 * @param {number} now
 * @param {number} [windowMs]
 * @returns {Array<{t: number, value: number}>}
 */
export function appendTemperatureSample(samples, value, now, windowMs = SPARKLINE_WINDOW_MS) {
	const prev = Array.isArray(samples) ? samples : []
	if (!Number.isFinite(now)) {
		return prev.map((row) => ({ t: row.t, value: row.value }))
	}
	const cutoff = now - windowMs
	const next = []
	for (const row of prev) {
		const kept = finiteTemp(row?.value)
		if (kept == null || !(row.t >= cutoff) || row.t > now) {
			continue
		}
		next.push({ t: row.t, value: kept })
	}
	const reading = finiteTemp(value)
	if (reading == null) {
		return next
	}
	const last = next[next.length - 1]
	if (last && last.t === now) {
		last.value = reading
		return next
	}
	next.push({ t: now, value: reading })
	return next
}

/**
 * Canvas polyline for the 5-minute sparkline.
 * A flat series is centered in the plot (not glued to the bottom edge) and
 * stretched across the time window so a steady print reads as a line.
 *
 * @param {Array<{t: number, value: number}>} samples
 * @param {{width: number, height: number, now?: number, windowMs?: number}} opts
 * @returns {{ready: boolean, commands: Array<{x: number, y: number}>, domainMin: number, domainMax: number}}
 */
export function sparklineGeometry(samples, opts = {}) {
	const width = Number(opts.width) || 0
	const height = Number(opts.height) || 0
	const now = Number.isFinite(opts.now) ? opts.now : Date.now()
	const windowMs = opts.windowMs ?? SPARKLINE_WINDOW_MS
	const cutoff = now - windowMs
	const points = []
	for (const row of samples || []) {
		const value = finiteTemp(row?.value)
		if (value == null || !(row.t >= cutoff)) {
			continue
		}
		points.push({ t: row.t, value })
	}
	points.sort((a, b) => a.t - b.t)
	if (points.length < 2 || width <= 0 || height <= 0 || windowMs <= 0) {
		return { ready: false, commands: [], domainMin: 0, domainMax: 0 }
	}
	let min = Infinity
	let max = -Infinity
	for (const p of points) {
		if (p.value < min) {
			min = p.value
		}
		if (p.value > max) {
			max = p.value
		}
	}
	const mid = (min + max) / 2
	const span = Math.max(max - min, 8)
	const domainMin = mid - span / 2
	const domainMax = mid + span / 2
	const pad = 6
	const innerH = Math.max(1, height - pad * 2)
	const commands = points.map((p) => {
		const rawX = ((p.t - cutoff) / windowMs) * width
		const x = Math.max(0, Math.min(width, rawX))
		const y = pad + (1 - (p.value - domainMin) / span) * innerH
		return { x, y }
	})
	return { ready: true, commands, domainMin, domainMax }
}
