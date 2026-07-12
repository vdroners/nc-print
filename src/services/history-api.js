/**
 * Print-history read API.
 *
 * History rows are captured server-side on the terminal print transition (see
 * events-api.js / PrintEventController). This module only reads/queries them and
 * exposes the derived quality-metrics + consumable-wear aggregates. All rows are
 * scoped server-side to the current user.
 */
import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'

const apiBase = () => generateUrl('/apps/nc_print/api/history')

// A hung slicer/DB must not block the UI — bound every call (matches the
// convention added to analysis-api in v1.35.0).
const REQ = { timeout: 8000 }

/**
 * @param {object} [filters]
 * @param {string} [filters.printerId]
 * @param {string} [filters.material]
 * @param {string} [filters.result] complete | error | cancel
 * @param {number} [filters.from] unix seconds
 * @param {number} [filters.to] unix seconds
 * @param {number} [filters.limit]
 * @param {number} [filters.offset]
 * @returns {Promise<{items: object[], total: number, limit: number, offset: number}>}
 */
export async function fetchHistory(filters = {}) {
	const params = {}
	if (filters.printerId) params.printer_id = filters.printerId
	if (filters.material) params.material = filters.material
	if (filters.result) params.result = filters.result
	if (filters.from) params.from = filters.from
	if (filters.to) params.to = filters.to
	if (filters.limit != null) params.limit = filters.limit
	if (filters.offset != null) params.offset = filters.offset
	const { data } = await axios.get(apiBase(), { ...REQ, params })
	return data
}

/** @returns {Promise<{overall: object, by_printer: object[]}>} */
export async function fetchMetrics() {
	const { data } = await axios.get(`${apiBase()}/metrics`, REQ)
	return data
}

/** @returns {Promise<{printers: object[], threshold_g: number, ptfe_inspect_hours: number, disclaimer: string}>} */
export async function fetchWear() {
	const { data } = await axios.get(`${apiBase()}/wear`, REQ)
	return data
}

/**
 * Aggregated analytics for the Overview dashboard: totals, per-material and
 * per-printer rollups, and a weekly time series.
 * @returns {Promise<object>}
 */
export async function fetchAnalytics() {
	const { data } = await axios.get(`${apiBase()}/analytics`, REQ)
	return data
}

/**
 * @param {number} id
 * @returns {Promise<{ok: boolean, deleted: boolean}>}
 */
export async function deleteHistoryRecord(id) {
	const { data } = await axios.delete(`${apiBase()}/${id}`, REQ)
	return data
}

/** @returns {Promise<{ok: boolean, cleared: number}>} */
export async function clearHistory() {
	const { data } = await axios.delete(apiBase(), REQ)
	return data
}
