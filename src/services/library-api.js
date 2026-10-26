/**
 * Parts library over /media/4TB/3dprints via nc-print-slicer /api/library.
 */
import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'

const base = () => generateUrl('/apps/nc_print/api/slicer/api/library')
const REQ = { timeout: 15000 }

export async function listLibrary({ subdir = '', q = '', limit = 100, offset = 0 } = {}) {
	const { data } = await axios.get(base(), { ...REQ, params: { subdir, q, limit, offset } })
	return data
}

export async function fetchLibraryFile(path) {
	const { data } = await axios.get(`${base()}/file`, {
		...REQ,
		params: { path },
		responseType: 'blob',
	})
	return data
}
