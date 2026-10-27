/**
 * Last good Moonraker reading, shown while the link is down.
 *
 * Progress advances only when Moonraker already reported a printing job
 * with enough elapsed time to imply a rate (progress / print_duration).
 * Paused jobs and short samples stay at the last known percent. The
 * estimate never reaches 100%.
 */

/** Elapsed print time before progress/print_duration is treated as a rate. */
export const RELIABLE_RATE_MIN_ELAPSED_S = 60

function finiteOrNull(value) {
	const n = Number(value)
	return Number.isFinite(n) ? n : null
}

/**
 * @param {object} printerState mapped printer state (connected reading)
 * @param {number} [nowMs]
 * @returns {object|null}
 */
export function snapshotFromPrinterState(printerState, nowMs = Date.now()) {
	if (!printerState?.connected) {
		return null
	}
	const state = String(printerState.state || '').trim().toLowerCase()
	const progressRaw = finiteOrNull(printerState.progress)
	const progress = progressRaw == null ? 0 : progressRaw
	const printDurationS = finiteOrNull(printerState.printDuration ?? printerState.print_duration)
	const totalDurationS = finiteOrNull(printerState.totalDuration ?? printerState.total_duration)
	const rateReliable = state === 'printing'
		&& printDurationS != null
		&& printDurationS >= RELIABLE_RATE_MIN_ELAPSED_S
		&& progress > 0
		&& progress < 1
	return {
		atMs: nowMs,
		state,
		filename: String(printerState.filename || ''),
		progress,
		printDurationS,
		totalDurationS,
		active: state === 'printing' || state === 'paused',
		rateReliable,
	}
}

/**
 * @param {number} atMs
 * @param {number} [nowMs]
 * @returns {string}
 */
export function formatLastSeen(atMs, nowMs = Date.now()) {
	const sec = Math.max(0, Math.round((nowMs - atMs) / 1000))
	if (sec < 60) {
		return `Last seen ${sec}s ago`
	}
	const min = Math.round(sec / 60)
	if (min < 60) {
		return `Last seen ${min}m ago`
	}
	const hr = Math.floor(min / 60)
	const rem = min % 60
	return rem ? `Last seen ${hr}h ${rem}m ago` : `Last seen ${hr}h ago`
}

/**
 * @param {object|null} snapshot
 * @param {number} [nowMs]
 * @returns {object|null}
 */
export function staleJobView(snapshot, nowMs = Date.now()) {
	if (!snapshot || !Number.isFinite(snapshot.atMs)) {
		return null
	}
	const ageS = Math.max(0, (nowMs - snapshot.atMs) / 1000)
	let progress = Number(snapshot.progress) || 0
	let estimated = false
	let remainingS = null
	const canEstimate = !!snapshot.rateReliable
		&& snapshot.state === 'printing'
		&& snapshot.printDurationS > 0
		&& progress > 0
		&& progress < 1
	if (canEstimate) {
		const rate = progress / snapshot.printDurationS
		progress = Math.min(0.99, Math.max(progress, progress + rate * ageS))
		const totalEst = snapshot.printDurationS / snapshot.progress
		remainingS = Math.max(0, totalEst - snapshot.printDurationS - ageS)
		estimated = true
	}
	return {
		ageS,
		lastSeenLabel: formatLastSeen(snapshot.atMs, nowMs),
		filename: String(snapshot.filename || ''),
		state: snapshot.state || '',
		active: !!snapshot.active,
		progress,
		estimated,
		remainingS,
		label: estimated ? 'Estimated from last contact' : 'Last known',
	}
}
