import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'
import { parseSseBlock, parseSseChunk, flushSseLeftover, buildSliceOverrides } from './slicer-utils.js'
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
	pauses = [],
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
	if (Array.isArray(pauses) && pauses.length) {
		params.set('pauses', JSON.stringify(pauses))
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

	return readSliceSse(response, onEvent)
}

/**
 * Consume a slice SSE response, invoking onEvent per event, and resolve the
 * terminal `done` payload (with a gcode-exists fallback). Shared by the single-
 * and multi-model slice paths.
 * @param {Response} response
 * @param {(ev: { event: string, parsed: object|null }) => void} [onEvent]
 * @returns {Promise<object>}
 */
async function readSliceSse(response, onEvent) {
	if (!response.ok) {
		const err = await response.json().catch(() => ({}))
		throw new Error(err.error || err.message || response.statusText)
	}

	const contentType = (response.headers.get('Content-Type') || '').toLowerCase()
	if (contentType.includes('application/json')) {
		const payload = await response.json()
		if (payload?.error) {
			throw new Error(payload.message || payload.error || 'Slice failed')
		}
		return payload
	}

	if (!response.body) {
		throw new Error('Slice response had no body')
	}
	const reader = response.body.getReader()
	const decoder = new TextDecoder()
	let leftover = ''
	let donePayload = null
	let lastJobId = null
	let lastPct = 0
	let lastStage = ''

	const applyEvents = (events) => {
		for (const ev of events) {
			onEvent?.(ev)
			if (ev.parsed?.job_id) {
				lastJobId = ev.parsed.job_id
			}
			if (ev.event === 'progress' && ev.parsed) {
				lastPct = ev.parsed.pct ?? lastPct
				lastStage = ev.parsed.stage || lastStage
			}
			if (ev.event === 'done' && ev.parsed) {
				donePayload = ev.parsed
			}
			if (ev.event === 'error' && ev.parsed) {
				throw new Error(ev.parsed.message || ev.parsed.error || 'Slice failed')
			}
		}
	}

	while (true) {
		const { value, done } = await reader.read()
		if (value) {
			const { leftover: nextLeft, events } = parseSseChunk(decoder.decode(value, { stream: true }), leftover)
			leftover = nextLeft
			applyEvents(events)
		}
		if (done) {
			applyEvents(flushSseLeftover(leftover))
			break
		}
	}

	if (!donePayload && lastJobId && await gcodeExists(lastJobId)) {
		donePayload = {
			ok: true,
			job_id: lastJobId,
			stream_incomplete: true,
		}
	}

	if (!donePayload) {
		const progressHint = lastPct > 0
			? ` (last progress: ${lastStage || 'slicing'} ${Math.round(lastPct)}%)`
			: ''
		const jobHint = lastJobId ? ` Job id ${lastJobId} was reported but G-code is not available yet.` : ''
		throw new Error(`SSE stream ended without a done event.${jobHint}${progressHint}`)
	}
	return donePayload
}

/**
 * Slice multiple models on one plate, arranged by the engine. Sends a real
 * multipart body (repeated `model` parts) so the proxy passes it through to the
 * sidecar unchanged.
 * @param {object} opts
 * @param {Array<{ data: ArrayBuffer|Blob, filename?: string }>} opts.models
 * @param {string} opts.printerId
 * @param {string[]} [opts.filamentIds]
 * @param {string} opts.processId
 * @param {object} [opts.overrides]
 * @param {boolean} [opts.arrange] default true
 * @param {AbortSignal} [opts.signal]
 * @param {(ev: object) => void} [opts.onEvent]
 * @returns {Promise<object>} Final `done` payload
 */
export async function sliceStreamMulti({
	models,
	printerId,
	filamentIds = [],
	processId,
	overrides = {},
	objectOverrides = null,
	arrange = true,
	signal,
	onEvent,
}) {
	if (!Array.isArray(models) || !models.length) {
		throw new Error('No models supplied to arrange')
	}
	const form = new FormData()
	for (let i = 0; i < models.length; i++) {
		const m = models[i]
		const blob = m.data instanceof Blob ? m.data : new Blob([m.data], { type: 'application/octet-stream' })
		form.append('model', blob, m.filename || `model_${i + 1}.stl`)
	}
	form.append('printer_id', printerId || '')
	form.append('process_id', processId || '')
	form.append('filament_ids', JSON.stringify(filamentIds || []))
	form.append('overrides', JSON.stringify(overrides || {}))
	// Per-object process overrides, aligned to the models list (index 0 = the
	// first model part). Only sent when at least one object has settings.
	if (Array.isArray(objectOverrides) && objectOverrides.some(o => o && Object.keys(o).length)) {
		form.append('object_overrides', JSON.stringify(objectOverrides))
	}
	form.append('arrange', arrange ? '1' : '0')

	const response = await fetch(`${apiBase()}/slice/stream`, {
		method: 'POST',
		headers: { Accept: 'text/event-stream' },
		body: form,
		credentials: 'same-origin',
		signal,
	})
	return readSliceSse(response, onEvent)
}

/**
 * @param {string} jobId
 * @returns {Promise<boolean>}
 */
async function gcodeExists(jobId) {
	const url = `${apiBase()}/jobs/${encodeURIComponent(jobId)}/gcode`
	try {
		const head = await fetch(url, { method: 'HEAD', credentials: 'same-origin' })
		if (head.ok) {
			return true
		}
		// Some proxies reject HEAD — fall back to a tiny ranged GET.
		const ranged = await fetch(url, {
			credentials: 'same-origin',
			headers: { Range: 'bytes=0-0' },
		})
		return ranged.ok || ranged.status === 206
	} catch {
		return false
	}
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

/**
 * Ask forge-slicer to cancel an in-progress job (best-effort).
 * @param {string} jobId
 */
export async function cancelSliceJob(jobId) {
	if (!jobId) {
		return
	}
	try {
		await axios.post(`${apiBase()}/jobs/${encodeURIComponent(jobId)}/cancel`)
	} catch (e) {
		console.debug('[nc_print] cancelSliceJob failed:', e?.message || e)
	}
}

export { uploadAndStart }
