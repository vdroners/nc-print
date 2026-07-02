/**
 * Pure helpers for Moonraker print history + statistics and embedded G-code
 * thumbnails (WS15). Framework-free for unit testing.
 */

/**
 * Parse `server/history/totals` → lifetime statistics.
 * Accepts `{result: {job_totals: {...}}}`, `{job_totals: {...}}`, or a bare
 * totals object.
 * @param {object} payload
 * @returns {{jobs: number, totalTimeS: number, printTimeS: number, filamentMm: number, longestJobS: number, longestPrintS: number}}
 */
export function parseHistoryTotals(payload) {
	const root = payload?.result ?? payload ?? {}
	const t = root.job_totals ?? root ?? {}
	const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
	return {
		jobs: num(t.total_jobs),
		totalTimeS: num(t.total_time),
		printTimeS: num(t.total_print_time),
		filamentMm: num(t.total_filament_used),
		longestJobS: num(t.longest_job),
		longestPrintS: num(t.longest_print),
	}
}

/**
 * Parse `server/history/list` → normalized job rows (newest first).
 * @param {object} payload
 * @returns {Array<{jobId: string, filename: string, status: string, startTime: number, endTime: number, printDurationS: number, totalDurationS: number, filamentMm: number}>}
 */
export function parseHistoryList(payload) {
	const root = payload?.result ?? payload ?? {}
	const jobs = Array.isArray(root.jobs) ? root.jobs : Array.isArray(root) ? root : []
	const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
	const rows = jobs.map((j) => ({
		jobId: String(j.job_id ?? j.jobId ?? ''),
		filename: String(j.filename ?? ''),
		status: String(j.status ?? 'unknown'),
		startTime: num(j.start_time),
		endTime: num(j.end_time),
		printDurationS: num(j.print_duration),
		totalDurationS: num(j.total_duration),
		filamentMm: num(j.filament_used),
	}))
	rows.sort((a, b) => b.startTime - a.startTime)
	return rows
}

/**
 * Success/fail counts from a parsed history list.
 * @param {Array<{status: string}>} rows
 * @returns {{completed: number, cancelled: number, error: number, total: number, successRate: number}}
 */
export function historyStatusBreakdown(rows) {
	const out = { completed: 0, cancelled: 0, error: 0, total: rows.length, successRate: 0 }
	for (const r of rows) {
		const s = String(r.status).toLowerCase()
		if (s === 'completed') {
			out.completed++
		} else if (s === 'cancelled' || s === 'canceled') {
			out.cancelled++
		} else if (s === 'error' || s === 'klippy_shutdown' || s === 'interrupted') {
			out.error++
		}
	}
	out.successRate = out.total > 0 ? out.completed / out.total : 0
	return out
}

/**
 * Choose the largest thumbnail from a Moonraker metadata `thumbnails` array.
 * @param {Array<{width?: number, height?: number, size?: number, data?: string, relative_path?: string}>} thumbnails
 * @returns {object|null}
 */
export function bestThumbnail(thumbnails) {
	if (!Array.isArray(thumbnails) || thumbnails.length === 0) {
		return null
	}
	return thumbnails.reduce((best, t) => {
		const area = (Number(t.width) || 0) * (Number(t.height) || 0)
		const bestArea = (Number(best.width) || 0) * (Number(best.height) || 0)
		return area > bestArea ? t : best
	})
}

/**
 * Build a displayable src for a thumbnail. Prefers an embedded base64 `data`
 * block (data URL); falls back to a proxied Moonraker file URL from
 * `relative_path`.
 * @param {object|null} thumb
 * @param {(path: string) => string} [proxyUrl] resolves a Moonraker file path to a fetchable URL
 * @returns {string|null}
 */
export function thumbnailSrc(thumb, proxyUrl) {
	if (!thumb) {
		return null
	}
	if (typeof thumb.data === 'string' && thumb.data.length > 0) {
		const clean = thumb.data.replace(/\s+/g, '')
		return `data:image/png;base64,${clean}`
	}
	if (typeof thumb.relative_path === 'string' && thumb.relative_path.length > 0 && typeof proxyUrl === 'function') {
		return proxyUrl(thumb.relative_path)
	}
	return null
}

/**
 * Extract the best thumbnail src directly from a `server/files/metadata`
 * response.
 * @param {object} metadataPayload
 * @param {(path: string) => string} [proxyUrl]
 * @returns {string|null}
 */
export function thumbnailFromMetadata(metadataPayload, proxyUrl) {
	const root = metadataPayload?.result ?? metadataPayload ?? {}
	return thumbnailSrc(bestThumbnail(root.thumbnails), proxyUrl)
}
