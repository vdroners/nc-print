/**
 * Client for the sidecar's static-analysis + reference endpoints (ported from
 * 3dprintforge): g-code linter, g-code reference, printer model presets. All go
 * through the read-allowlisted slicer proxy.
 */
import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'

const apiBase = () => generateUrl('/apps/nc_print/api/slicer')

// Explicit timeout so a hung slicer proxy can't block the UI indefinitely.
const REQ = { timeout: 8000 }

/**
 * Lint a sliced job's g-code (by job_id) or raw text.
 * @param {object} opts
 * @param {string} [opts.jobId]
 * @param {string} [opts.text]
 * @param {string} [opts.firmware] marlin|klipper|reprap|snapmaker|auto
 * @returns {Promise<{issues:Array, stats:object}>}
 */
export async function lintGcode({ jobId, text, firmware = 'auto' }) {
	const body = { firmware }
	if (text) {
		body.text = text
	} else if (jobId) {
		body.job_id = jobId
	}
	const { data } = await axios.post(`${apiBase()}/gcode/lint`, body, REQ)
	return data
}

/**
 * Fetch a single g-code reference entry by code (e.g. 'M104').
 * @param {string} code
 * @returns {Promise<object|null>}
 */
export async function gcodeReference(code) {
	try {
		const { data } = await axios.get(`${apiBase()}/gcode/reference?code=${encodeURIComponent(code)}`, REQ)
		return data
	} catch (e) {
		if (e?.response?.status === 404) {
			return null
		}
		console.debug('[nc_print] gcodeReference failed:', e?.message || e)
		throw e
	}
}

/**
 * Search the g-code reference.
 * @param {object} [opts] { q, category, firmware }
 * @returns {Promise<Array>}
 */
export async function searchGcodeReference({ q = '', category = '', firmware = '' } = {}) {
	const params = new URLSearchParams()
	if (q) params.set('q', q)
	if (category) params.set('category', category)
	if (firmware) params.set('firmware', firmware)
	const qs = params.toString()
	const { data } = await axios.get(`${apiBase()}/gcode/reference${qs ? '?' + qs : ''}`, REQ)
	return data.reference || []
}

/**
 * Look up a static printer model preset.
 * @param {string} vendor
 * @param {string} model
 * @returns {Promise<object|null>}
 */
export async function printerPreset(vendor, model) {
	try {
		const { data } = await axios.get(
			`${apiBase()}/printer-presets?vendor=${encodeURIComponent(vendor)}&model=${encodeURIComponent(model)}`, REQ)
		return data
	} catch (e) {
		if (e?.response?.status === 404) {
			return null
		}
		console.debug('[nc_print] printerPreset failed:', e?.message || e)
		throw e
	}
}
