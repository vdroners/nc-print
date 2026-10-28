/**
 * Pure helpers for the print/job queue + exclude-object features (WS13).
 * Framework-free for unit testing.
 */

/**
 * Parse `server/job_queue/status` into a normalized queue model.
 * @param {object} payload
 * @returns {{state: string, jobs: Array<{jobId: string, filename: string, timeAdded: number}>}}
 */
export function parseJobQueue(payload) {
	const root = payload?.result ?? payload ?? {}
	const raw = Array.isArray(root.queued_jobs) ? root.queued_jobs : []
	const jobs = raw.map((j) => ({
		jobId: String(j.job_id ?? j.jobId ?? ''),
		filename: String(j.filename ?? ''),
		timeAdded: Number(j.time_added ?? 0) || 0,
	}))
	return {
		state: String(root.queue_state ?? 'ready'),
		jobs,
	}
}

/**
 * Move an item within an ordered id list (pure). Returns a new array.
 * @param {string[]} ids
 * @param {number} from
 * @param {number} to
 * @returns {string[]}
 */
export function reorderQueueIds(ids, from, to) {
	if (!Array.isArray(ids)) {
		return []
	}
	const out = ids.slice()
	if (from < 0 || from >= out.length || to < 0 || to >= out.length || from === to) {
		return out
	}
	const [moved] = out.splice(from, 1)
	out.splice(to, 0, moved)
	return out
}

/**
 * Add filenames to an in-memory queue model (dedup-free, mirrors Moonraker
 * append semantics). Returns a new list.
 * @param {Array<{jobId: string, filename: string}>} jobs
 * @param {string[]} filenames
 * @returns {Array<{jobId: string, filename: string, timeAdded: number}>}
 */
export function addToQueueModel(jobs, filenames) {
	const base = Array.isArray(jobs) ? jobs.slice() : []
	const now = Date.now() / 1000
	for (const f of filenames || []) {
		base.push({ jobId: `local-${base.length}-${f}`, filename: String(f), timeAdded: now })
	}
	return base
}

/**
 * Remove a job by id from an in-memory queue model. Returns a new list.
 * @param {Array<{jobId: string}>} jobs
 * @param {string} jobId
 * @returns {Array}
 */
export function removeFromQueueModel(jobs, jobId) {
	return (Array.isArray(jobs) ? jobs : []).filter((j) => j.jobId !== jobId)
}

function asFinite(value) {
	const n = Number(value)
	return Number.isFinite(n) ? n : null
}

/**
 * @param {unknown} raw Moonraker center: [x, y], [x, y, z], or "x,y"
 * @returns {[number, number]|null}
 */
function parseCenter(raw) {
	if (typeof raw === 'string') {
		raw = raw.split(/[,\s]+/).filter(Boolean)
	}
	if (!Array.isArray(raw) || raw.length < 2) {
		return null
	}
	const x = asFinite(raw[0])
	const y = asFinite(raw[1])
	if (x == null || y == null) {
		return null
	}
	return [x, y]
}

/**
 * @param {Array<[number, number]>} points
 * @returns {[number, number]}
 */
function centroid(points) {
	let x = 0
	let y = 0
	for (const [px, py] of points) {
		x += px
		y += py
	}
	return [x / points.length, y / points.length]
}

/**
 * Klipper POLYGON is usually [[x, y], ...]. Also accept {x,y} points,
 * a flat [x, y, x, y, ...] list, or a JSON string of either.
 * @param {unknown} raw
 * @returns {Array<[number, number]>|null}
 */
function parsePolygon(raw) {
	if (typeof raw === 'string') {
		const trimmed = raw.trim()
		if (!trimmed) {
			return null
		}
		try {
			raw = JSON.parse(trimmed)
		} catch {
			return null
		}
	}
	if (!Array.isArray(raw) || raw.length === 0) {
		return null
	}
	if (raw.every((n) => asFinite(n) != null)) {
		if (raw.length < 6 || raw.length % 2 !== 0) {
			return null
		}
		const flat = []
		for (let i = 0; i < raw.length; i += 2) {
			flat.push([asFinite(raw[i]), asFinite(raw[i + 1])])
		}
		return flat
	}
	const pts = []
	for (const p of raw) {
		if (Array.isArray(p) && p.length >= 2) {
			const x = asFinite(p[0])
			const y = asFinite(p[1])
			if (x != null && y != null) {
				pts.push([x, y])
			}
		} else if (p && typeof p === 'object') {
			const x = asFinite(p.x ?? p.X)
			const y = asFinite(p.y ?? p.Y)
			if (x != null && y != null) {
				pts.push([x, y])
			}
		}
	}
	return pts.length >= 3 ? pts : null
}

/**
 * `objects` is a list of `{name, center, polygon}` (or plain names). A few
 * payloads use a name-keyed map instead; normalize both.
 * @param {unknown} raw
 * @returns {unknown[]}
 */
function normalizeRawObjects(raw) {
	if (Array.isArray(raw)) {
		return raw
	}
	if (raw && typeof raw === 'object') {
		return Object.entries(raw).map(([key, val]) => {
			if (val && typeof val === 'object') {
				return { name: val.name ?? key, ...val }
			}
			return { name: key }
		})
	}
	return []
}

/**
 * @param {unknown} entry
 * @param {Set<string>} excluded
 */
function parseOneExcludeObject(entry, excluded) {
	if (typeof entry === 'string' || typeof entry === 'number') {
		const name = String(entry)
		return { name, excluded: excluded.has(name), center: null, polygon: null }
	}
	const name = String(entry?.name ?? '')
	const polygon = parsePolygon(entry?.polygon)
	let center = parseCenter(entry?.center)
	if (!center && polygon) {
		center = centroid(polygon)
	}
	return {
		name,
		excluded: excluded.has(name),
		center,
		polygon,
	}
}

/**
 * Parse the `exclude_object` printer object into a list of objects with
 * excluded state and bed geometry for the active print.
 *
 * Moonraker/Klipper expose `objects[].center` and, when the slicer emitted
 * EXCLUDE_OBJECT_DEFINE POLYGON, `objects[].polygon`. There is no separate
 * gcode bounding-box feed in this app; the bed view uses this payload only.
 *
 * @param {object} payload printer/objects/query response or bare exclude_object
 * @returns {{objects: Array<{name: string, excluded: boolean, center: [number, number]|null, polygon: Array<[number, number]>|null}>, currentObject: string|null, excludedCount: number}}
 */
export function parseExcludeObjects(payload) {
	const status = payload?.result?.status ?? payload?.status ?? payload ?? {}
	const eo = status.exclude_object ?? status ?? {}
	const rawObjects = normalizeRawObjects(eo.objects)
	const excluded = new Set((Array.isArray(eo.excluded_objects) ? eo.excluded_objects : []).map(String))
	const objects = rawObjects.map((o) => parseOneExcludeObject(o, excluded))
	return {
		objects,
		currentObject: eo.current_object != null && eo.current_object !== '' ? String(eo.current_object) : null,
		excludedCount: excluded.size,
	}
}
