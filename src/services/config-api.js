import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'
import { fetchAppStatus } from './status-api.js'

const base = () => generateUrl('/apps/nc_print/api/config')

/**
 * Load NC Print app configuration (slicer proxy, Moonraker, camera URLs).
 * @returns {Promise<object>}
 */
export async function fetchConfig() {
	const { data } = await axios.get(base())
	return data
}

export { fetchAppStatus }
