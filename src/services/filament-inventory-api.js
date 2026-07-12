/**
 * Filament/spool inventory API — a standalone pillar. All rows are scoped
 * server-side to the current user (the mapper filters by uid, IDOR-safe).
 */
import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'

const apiBase = () => generateUrl('/apps/nc_print/api/filament')

// A hung DB must not block the UI — bound every call (matches history-api).
const REQ = { timeout: 8000 }

/**
 * @param {boolean} [includeArchived] include archived spools
 * @returns {Promise<{spools: object[], summary: {count: number, total_remaining_g: number, total_cost: number, low_stock: number}}>}
 */
export async function fetchSpools(includeArchived = false) {
	const params = {}
	if (includeArchived) params.archived = 1
	const { data } = await axios.get(apiBase(), { ...REQ, params })
	return data
}

/**
 * @param {object} payload brand, material, color_name, color_hex, diameter,
 *   weight_total_g, weight_remaining_g, cost, currency, location, notes
 * @returns {Promise<object>} the created spool
 */
export async function createSpool(payload) {
	const { data } = await axios.post(apiBase(), payload, REQ)
	return data
}

/**
 * @param {number} id
 * @param {object} payload partial spool fields to update
 * @returns {Promise<object>} the updated spool
 */
export async function updateSpool(id, payload) {
	const { data } = await axios.put(`${apiBase()}/${id}`, payload, REQ)
	return data
}

/**
 * @param {number} id
 * @returns {Promise<{ok: boolean, deleted: boolean}>}
 */
export async function deleteSpool(id) {
	const { data } = await axios.delete(`${apiBase()}/${id}`, REQ)
	return data
}
