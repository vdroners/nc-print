/**
 * Filament material reference client.
 *
 * Fetches the sidecar's static material database (nozzle/bed/chamber temps,
 * drying, plate compatibility, properties, tips, warnings) for the material
 * info panel. Data-only — no slicing.
 */
import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'

const apiBase = () => generateUrl('/apps/nc_print/api/slicer')

/**
 * List all materials, optionally filtered by category.
 * @param {string} [category] standard|engineering|composite|flexible|specialty|support
 * @returns {Promise<Array<object>>}
 */
export async function fetchMaterials(category = '') {
	const url = category
		? `${apiBase()}/materials?category=${encodeURIComponent(category)}`
		: `${apiBase()}/materials`
	const { data } = await axios.get(url)
	return data.materials || []
}

/**
 * Fetch a single material by its id slug (e.g. 'pla', 'pa-cf').
 * @param {string} id
 * @returns {Promise<object>}
 */
export async function fetchMaterial(id) {
	const { data } = await axios.get(`${apiBase()}/materials/${encodeURIComponent(id)}`)
	return data
}
