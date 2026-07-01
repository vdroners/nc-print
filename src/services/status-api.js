import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'

/**
 * App-level health: slicer + Moonraker probes from PHP.
 * @returns {Promise<object>}
 */
export async function fetchAppStatus() {
	const { data } = await axios.get(generateUrl('/apps/nc_print/api/status'))
	return data
}

export function statusApiUrl() {
	return generateUrl('/apps/nc_print/api/status')
}
