/**
 * Turn an upload / send-to-printer failure into a retryable message.
 * Pause, cancel, and emergency stop do not use this — those stay single-shot.
 */

export const TIMEOUT_MESSAGE = 'The upload timed out before the printer confirmed the file. The link may be too slow. Nothing was retried.'

export const UNREACHABLE_MESSAGE = 'The connection to the printer dropped or could not be opened before the upload finished. Nothing was retried.'

export const OTHER_MESSAGE = 'The upload did not finish. Nothing was retried.'

const START_WARNING = ' If a print may already have started, check the printer before retrying so you do not start a second job.'

const NETWORK_CODES = new Set([
	'ECONNRESET',
	'ECONNREFUSED',
	'ENOTFOUND',
	'EAI_AGAIN',
	'ERR_NETWORK',
	'EPIPE',
])

function responseData(err) {
	const data = err?.response?.data
	return data && typeof data === 'object' ? data : {}
}

function isConnectTimeout(text) {
	return /connection timed out|connect timed out|failed to connect|could not connect|couldn't connect/i.test(text || '')
}

/**
 * @param {unknown} err axios-style error, or a thrown Error
 * @returns {{ kind: 'timeout'|'unreachable'|'other', message: string, retryable: boolean }}
 */
export function classifyGcodeTransferError(err) {
	const data = responseData(err)
	const failure = String(data.failure || '')
	const errorCode = String(data.error || '')
	const status = Number(err?.response?.status || 0)
	const axiosCode = String(err?.code || '')
	const rawMessage = String(err?.message || '')
	const serverMessage = typeof data.message === 'string' ? data.message.trim() : ''

	let kind = 'other'
	if (failure === 'timeout' || errorCode === 'moonraker_timeout') {
		kind = 'timeout'
	} else if (failure === 'unreachable' || errorCode === 'moonraker_unreachable' || errorCode === 'backend_unreachable') {
		kind = 'unreachable'
	} else if (failure === 'other' || errorCode === 'moonraker_upload_failed') {
		kind = 'other'
	} else if (isConnectTimeout(rawMessage) || isConnectTimeout(serverMessage)) {
		kind = 'unreachable'
	} else if (
		status === 408
		|| status === 504
		|| axiosCode === 'ECONNABORTED'
		|| /operation timed out|timeout of \d+|\btimed out\b/i.test(rawMessage)
	) {
		kind = 'timeout'
	} else if (
		status === 502
		|| status === 503
		|| NETWORK_CODES.has(axiosCode)
		|| /connection reset|econnreset|econnrefused|network error|socket hang up|failed to fetch/i.test(rawMessage)
	) {
		kind = 'unreachable'
	}

	const defaults = {
		timeout: TIMEOUT_MESSAGE,
		unreachable: UNREACHABLE_MESSAGE,
		other: OTHER_MESSAGE,
	}
	let message = serverMessage
	if (!message) {
		// Keep a specific non-HTTP exception ("disk full"). Timeouts and link
		// drops use the fixed copy so a raw axios string is not the banner.
		if (kind === 'other' && rawMessage && !/^request failed with status code/i.test(rawMessage)) {
			message = rawMessage
		} else {
			message = defaults[kind]
		}
	}

	return {
		kind,
		message,
		retryable: data.retryable !== false,
	}
}

/**
 * Append the start-print caution when this attempt asked Moonraker to start.
 * A timed-out upload may already have started the job, so Retry stays manual.
 * @param {{ kind: string, message: string, retryable: boolean }} classified
 * @param {{ start?: boolean }} [opts]
 */
export function formatGcodeTransferFailure(classified, { start = false } = {}) {
	let message = classified.message
	if (start && !/second job/i.test(message)) {
		message = `${message}${START_WARNING}`
	}
	return { ...classified, message }
}

/**
 * @param {string} kind
 * @param {boolean} [start]
 */
export function gcodeTransferFailureTitle(kind, start = false) {
	if (kind === 'timeout') {
		return start ? 'Send timed out' : 'Upload timed out'
	}
	if (kind === 'unreachable') {
		return 'Printer unreachable'
	}
	return start ? 'Send failed' : 'Upload failed'
}
