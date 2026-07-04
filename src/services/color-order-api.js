/**
 * Multi-color flush / color-order optimizer client.
 *
 * Posts a plate's filament colors to the sidecar's OrcaSlicer-faithful flush
 * model and gets back the load order that minimises total purge, plus the grams
 * saved vs loading the colors as listed. Pure math on the sidecar — no slicing.
 */
import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'

const apiBase = () => generateUrl('/apps/nc_print/api/slicer')

/**
 * @param {object} opts
 * @param {string[]} opts.colors  filament colors as "#RRGGBB"
 * @param {number} [opts.density] filament density g/cm³ (default PLA 1.24)
 * @returns {Promise<object>} { order, orderedColors, names, optimizedFlushG,
 *   baselineFlushG, savedG, savedPct, method }
 */
export async function optimizeColorOrder({ colors, density }) {
	const body = { colors }
	if (density != null) {
		body.density = density
	}
	const { data } = await axios.post(`${apiBase()}/color-order`, body)
	return data
}
