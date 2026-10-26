import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'

const base = () => generateUrl('/apps/nc_print/api/slicer/api/model-forge')
const REQ = { timeout: 30000 }

export async function listGenerators() {
	const { data } = await axios.get(base(), REQ)
	return data
}

export async function generateModel(id, options = {}, format = '3mf') {
	const { data } = await axios.post(
		`${base()}/${encodeURIComponent(id)}`,
		{ options, format },
		{ ...REQ, responseType: 'blob' },
	)
	return data
}
