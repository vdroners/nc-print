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

/**
 * Parse the `exclude_object` printer object into a list of objects with
 * excluded state for the active print.
 * @param {object} payload printer/objects/query response or bare exclude_object
 * @returns {{objects: Array<{name: string, excluded: boolean, center: number[]|null}>, currentObject: string|null, excludedCount: number}}
 */
export function parseExcludeObjects(payload) {
	const status = payload?.result?.status ?? payload?.status ?? payload ?? {}
	const eo = status.exclude_object ?? status ?? {}
	const rawObjects = Array.isArray(eo.objects) ? eo.objects : []
	const excluded = new Set((Array.isArray(eo.excluded_objects) ? eo.excluded_objects : []).map(String))
	const objects = rawObjects.map((o) => {
		const name = String(o.name ?? '')
		return {
			name,
			excluded: excluded.has(name),
			center: Array.isArray(o.center) ? o.center.map(Number) : null,
		}
	})
	return {
		objects,
		currentObject: eo.current_object != null ? String(eo.current_object) : null,
		excludedCount: excluded.size,
	}
}
