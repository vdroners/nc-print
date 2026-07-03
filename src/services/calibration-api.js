/**
 * Calibration suite client.
 *
 * Lists the sidecar's calibration catalog (shipped models + parametric temp
 * tower) and slices a chosen one against the active printer, reusing the slice
 * SSE contract.
 */
import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'
import { parseSseChunk, flushSseLeftover } from './slicer-utils.js'

const apiBase = () => generateUrl('/apps/nc_print/api/slicer')

/**
 * @returns {Promise<Array<{ id: string, name: string, kind: string, help?: string, params?: object }>>}
 */
export async function fetchCalibrations() {
	const { data } = await axios.get(`${apiBase()}/calibration/list`)
	return data.calibrations || []
}

/**
 * Slice a calibration model. Streams SSE; resolves the `done` payload.
 * @param {object} opts
 * @param {string} opts.calibId
 * @param {string} opts.printerId
 * @param {string} [opts.processId]
 * @param {string[]} [opts.filamentIds]
 * @param {object} [opts.overrides]
 * @param {object} [opts.params]
 * @param {(ev: object) => void} [opts.onEvent]
 * @returns {Promise<object>}
 */
export async function sliceCalibration({
	calibId,
	printerId,
	processId = '',
	filamentIds = [],
	overrides = {},
	params = null,
	onEvent,
}) {
	const body = { printer_id: printerId, process_id: processId, filament_ids: filamentIds, overrides }
	if (params) {
		body.params = params
	}
	const response = await fetch(`${apiBase()}/calibration/${encodeURIComponent(calibId)}/slice`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
		body: JSON.stringify(body),
		credentials: 'same-origin',
	})
	if (!response.ok) {
		const err = await response.json().catch(() => ({}))
		throw new Error(err.message || err.error || `Calibration slice failed (${response.status})`)
	}
	if (!response.body) {
		throw new Error('Calibration slice returned no body')
	}
	const reader = response.body.getReader()
	const decoder = new TextDecoder()
	let leftover = ''
	let done = null
	const apply = (events) => {
		for (const ev of events) {
			onEvent?.(ev)
			if (ev.event === 'done' && ev.parsed) {
				done = ev.parsed
			}
			if (ev.event === 'error' && ev.parsed) {
				throw new Error(ev.parsed.message || ev.parsed.error || 'Calibration slice failed')
			}
		}
	}
	while (true) {
		const { value, done: streamDone } = await reader.read()
		if (value) {
			const { leftover: next, events } = parseSseChunk(decoder.decode(value, { stream: true }), leftover)
			leftover = next
			apply(events)
		}
		if (streamDone) {
			apply(flushSseLeftover(leftover))
			break
		}
	}
	if (!done) {
		throw new Error('Calibration slice ended without a result')
	}
	return done
}
