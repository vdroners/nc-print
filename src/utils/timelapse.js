/**
 * Pure helpers for the moonraker-timelapse integration (WS16).
 * Framework-free for unit testing.
 */

/**
 * Parse a `server/files/list?root=timelapse` response into rendered video
 * rows (newest first). Only keeps video files.
 * @param {object|Array} payload
 * @returns {Array<{path: string, filename: string, sizeBytes: number, modified: number}>}
 */
export function parseTimelapseList(payload) {
	const list = Array.isArray(payload)
		? payload
		: Array.isArray(payload?.result) ? payload.result
			: Array.isArray(payload?.files) ? payload.files : []
	const videos = list
		.filter((f) => typeof (f?.path ?? f?.filename) === 'string')
		.map((f) => {
			const path = String(f.path ?? f.filename)
			return {
				path,
				filename: path.split('/').pop(),
				sizeBytes: Number(f.size ?? 0) || 0,
				modified: Number(f.modified ?? 0) || 0,
			}
		})
		.filter((f) => /\.(mp4|mov|webm|mkv|avi)$/i.test(f.filename))
	videos.sort((a, b) => b.modified - a.modified)
	return videos
}

/**
 * Whether the timelapse feature should be shown, given the feature-detection
 * map from `/api/status`.
 * @param {object} features moonraker_features map
 * @returns {boolean}
 */
export function timelapseSupported(features) {
	return !!(features && features.timelapse)
}

/**
 * Human-readable file size.
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
	const n = Number(bytes)
	if (!Number.isFinite(n) || n <= 0) {
		return '—'
	}
	const units = ['B', 'KB', 'MB', 'GB']
	let v = n
	let i = 0
	while (v >= 1024 && i < units.length - 1) {
		v /= 1024
		i++
	}
	return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}
