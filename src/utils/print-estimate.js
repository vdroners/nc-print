/**
 * Honest print-time labels.
 *
 * Moonraker `print_stats.total_duration` is elapsed wall clock (it includes
 * pauses). It is not a slicer estimate. Subtracting `print_duration` from it
 * yields pause time, which the UI used to show as "~0 min remaining" and as a
 * fake overrun ("Estimated 0 min · Actual 3 min (+3 min)").
 */

import { formatPrintTime } from '@/services/slicer-utils.js'

/**
 * @param {unknown} value
 * @returns {number|null} finite seconds strictly greater than zero
 */
export function positiveSeconds(value) {
	const n = Number(value)
	return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Duration embedded in a slicer filename, such as `_10h12m12s` or `_45m30s`.
 * Ignores millimeters (`0.2mm`) and other letter suffixes. The last match wins
 * so a trailing slicer suffix beats an earlier token.
 * @param {string} filename
 * @returns {number|null}
 */
export function parseDurationFromFilename(filename) {
	const name = String(filename || '')
	if (!name) {
		return null
	}
	const re = /(?:^|[^0-9.])(\d{1,4})h(?:(\d{1,2})m(?:(\d{1,2})s)?)?|(?:^|[^0-9.])(\d{1,4})m(\d{1,2})s/gi
	let best = null
	let match
	while ((match = re.exec(name))) {
		const end = match.index + match[0].length
		const tail = name.charAt(end)
		if (tail && /[a-z]/i.test(tail)) {
			continue
		}
		let seconds = 0
		if (match[1] != null) {
			seconds = Number(match[1]) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0)
		} else if (match[4] != null) {
			seconds = Number(match[4]) * 60 + Number(match[5] || 0)
		}
		if (seconds > 0) {
			best = seconds
		}
	}
	return best
}

/**
 * `estimated_time` from Moonraker `server/files/metadata`, in seconds.
 * @param {object|null|undefined} payload
 * @returns {number|null}
 */
export function estimateSecondsFromMetadata(payload) {
	const root = payload?.result ?? payload ?? {}
	return positiveSeconds(root.estimated_time ?? root.estimatedTime)
}

function basename(path) {
	const value = String(path || '').trim().replace(/\\/g, '/')
	if (!value) {
		return ''
	}
	return value.split('/').pop().toLowerCase()
}

/**
 * A session slicer estimate applies when it belongs to the file on the printer.
 * An empty name on either side keeps the estimate (nothing to contradict it).
 * @param {string} slicerFilename
 * @param {string} printingFilename
 * @returns {boolean}
 */
export function slicerEstimateMatchesJob(slicerFilename, printingFilename) {
	const sliced = basename(slicerFilename)
	const printing = basename(printingFilename)
	if (!sliced || !printing) {
		return true
	}
	return sliced === printing
}

/**
 * Pick one estimate. Moonraker file metadata first, then the matching slicer
 * result, then a duration token in the gcode filename.
 * @param {{ metadataEstimateS?: unknown, slicerEstimateS?: unknown, slicerFilename?: string, filename?: string }} input
 * @returns {{ seconds: number, source: 'metadata'|'slicer'|'filename' }|null}
 */
export function resolvePrintEstimateSeconds(input = {}) {
	const meta = positiveSeconds(input.metadataEstimateS)
	if (meta != null) {
		return { seconds: meta, source: 'metadata' }
	}
	const slicer = positiveSeconds(input.slicerEstimateS)
	if (slicer != null && slicerEstimateMatchesJob(input.slicerFilename, input.filename)) {
		return { seconds: slicer, source: 'slicer' }
	}
	const fromName = parseDurationFromFilename(input.filename)
	if (fromName != null) {
		return { seconds: fromName, source: 'filename' }
	}
	return null
}

/**
 * Remaining time from a real estimate and elapsed print time.
 * A missing estimate returns null — never zero derived from total_duration.
 * @param {unknown} estimatedS
 * @param {unknown} elapsedS
 * @returns {number|null}
 */
export function remainingFromEstimate(estimatedS, elapsedS) {
	const est = positiveSeconds(estimatedS)
	if (est == null) {
		return null
	}
	const elapsed = Number(elapsedS)
	if (!Number.isFinite(elapsed) || elapsed < 0) {
		return est
	}
	return Math.max(0, est - elapsed)
}

/**
 * One line under the job name. A zero or missing estimate never produces a
 * "+overrun" against the clock.
 * @param {unknown} estimatedS
 * @param {unknown} actualS
 * @returns {string|null}
 */
export function formatEstimateActualLine(estimatedS, actualS) {
	const est = positiveSeconds(estimatedS)
	// Number(null) is 0. A missing clock is not "0 min".
	const hasActual = actualS != null && actualS !== '' && Number.isFinite(Number(actualS)) && Number(actualS) >= 0
	const actual = hasActual ? Number(actualS) : null
	if (est == null) {
		return hasActual ? 'Estimate unavailable' : null
	}
	const estLabel = formatPrintTime(est)
	if (!hasActual) {
		return `Estimated ${estLabel}`
	}
	const delta = actual - est
	const sign = delta >= 0 ? '+' : '−'
	return `Estimated ${estLabel} · Actual ${formatPrintTime(actual)} (${sign}${formatPrintTime(Math.abs(delta))})`
}
