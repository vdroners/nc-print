import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'

const base = () => generateUrl('/apps/nc_print/api/config')

/**
 * Load NC Print app configuration (slicer proxy, Moonraker, camera URLs).
 * @returns {Promise<object>}
 */
export async function fetchConfig() {
	const { data } = await axios.get(base())
	return data
}

/**
 * @returns {Promise<object>} Slicer service health / probe.
 */
export async function fetchSlicerStatus() {
	const { data } = await axios.get(generateUrl('/apps/nc_print/api/slicer/status'))
	return data
}

/**
 * @returns {Promise<object>} Moonraker connection probe.
 */
export async function fetchPrinterStatus() {
	const { data } = await axios.get(generateUrl('/apps/nc_print/api/printer/status'))
	return data
}
