/**
 * Maintenance / wear API — a standalone pillar layered on the print-history wear
 * heuristic. The summary reports per-printer, per-component lifetime estimates;
 * the log records a service action. All rows are scoped server-side to the
 * current user (the mapper filters by uid, IDOR-safe).
 */
import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'

const apiBase = () => generateUrl('/apps/nc_print/api/maintenance')

// A hung DB must not block the UI — bound every call (matches history-api).
const REQ = { timeout: 8000 }

/**
 * @returns {Promise<{printers: object[], components: object, disclaimer: string}>}
 */
export async function fetchMaintenance() {
	const { data } = await axios.get(apiBase(), REQ)
	return data
}

/**
 * @param {object} payload printer_id, component, action, hours_at, cost, notes
 * @returns {Promise<object>} the logged maintenance record
 */
export async function logMaintenance(payload) {
	const { data } = await axios.post(`${apiBase()}/log`, payload, REQ)
	return data
}
