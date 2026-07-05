import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'

/**
 * App-level health: slicer + Moonraker probes from PHP.
 * @param {object} [opts]
 * @param {string} [opts.printerId] probe Moonraker for this target id (session or admin)
 * @returns {Promise<object>}
 */
export async function fetchAppStatus(opts = {}) {
	const params = {}
	if (opts.printerId) {
		params.printer_id = opts.printerId
	}
	const { data } = await axios.get(generateUrl('/apps/nc_print/api/status'), { params })
	return data
}

export function statusApiUrl() {
	return generateUrl('/apps/nc_print/api/status')
}
