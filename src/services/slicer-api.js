import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'
import { parseSseBlock, parseSseChunk, buildSliceOverrides } from './slicer-utils.js'
import { uploadAndStart } from './moonraker-api.js'

export { parseSseBlock, parseSseChunk, buildSliceOverrides } from './slicer-utils.js'

const apiBase = () => generateUrl('/apps/nc_print/api/slicer')

/**
 * @param {'printer'|'filament'|'process'|'all'} kind
 */
export async function fetchProfiles(kind = 'all') {
	const { data } = await axios.get(`${apiBase()}/profiles`, { params: { kind } })
	return data.profiles || []
}

/**
 * Stream slice progress via SSE (POST model bytes).
 * @param {object} opts
 * @param {ArrayBuffer|Blob} opts.model
 * @param {string} opts.filename
 * @param {string} opts.printerId
 * @param {string[]} opts.filamentIds
 * @param {string} opts.processId
 * @param {object} [opts.overrides]
 * @param {AbortSignal} [opts.signal]
 * @param {(ev: { event: string, parsed: object|null }) => void} [opts.onEvent]
 * @returns {Promise<object>} Final `done` payload
 */
export async function sliceStream({
	model,
	filename,
	printerId,
	filamentIds = [],
	processId,
	overrides = {},
	signal,
	onEvent,
}) {
	const params = new URLSearchParams({
		printer_id: printerId || '',
		process_id: processId || '',
	})
	if (filamentIds.length) {
		params.set('filament_ids', JSON.stringify(filamentIds))
	}
	if (Object.keys(overrides).length) {
		params.set('overrides', JSON.stringify(overrides))
	}

	const body = model instanceof Blob ? await model.arrayBuffer() : model
	const url = `${apiBase()}/slice/stream?${params.toString()}`

	const response = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/octet-stream',
			Accept: 'text/event-stream',
			'X-Filename': filename || 'model.stl',
		},
		body,
		credentials: 'same-origin',
		signal,
	})

	if (!response.ok) {
		const err = await response.json().catch(() => ({}))
		throw new Error(err.error || err.message || response.statusText)
	}

	const reader = response.body.getReader()
	const decoder = new TextDecoder()
	let leftover = ''
	let donePayload = null

	while (true) {
		const { value, done } = await reader.read()
		if (done) {
			break
		}
		const { leftover: nextLeft, events } = parseSseChunk(decoder.decode(value, { stream: true }), leftover)
		leftover = nextLeft
		for (const ev of events) {
			onEvent?.(ev)
			if (ev.event === 'done' && ev.parsed) {
				donePayload = ev.parsed
			}
			if (ev.event === 'error' && ev.parsed) {
				throw new Error(ev.parsed.message || ev.parsed.error || 'Slice failed')
			}
		}
	}

	if (!donePayload) {
		throw new Error('SSE stream ended without a done event')
	}
	return donePayload
}

/**
 * @param {string} jobId
 * @returns {Promise<Blob>}
 */
export async function downloadGcode(jobId) {
	const url = `${apiBase()}/jobs/${encodeURIComponent(jobId)}/gcode`
	const response = await fetch(url, { credentials: 'same-origin' })
	if (!response.ok) {
		throw new Error(`G-code download failed (${response.status})`)
	}
	return response.blob()
}

/**
 * @param {string} jobId
 * @returns {string} Preview image URL (same-origin)
 */
export function previewUrl(jobId) {
	return `${apiBase()}/jobs/${encodeURIComponent(jobId)}/preview.png`
}

export { uploadAndStart }
