import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'

const base = () => generateUrl('/apps/nc_print/api/files')

/**
 * Resolve file metadata (size, basename) without downloading body.
 * @param {{ dav_path?: string, file_id?: number }} params
 */
export async function resolveFile(params) {
	const { data } = await axios.post(`${base()}/resolve`, params)
	return data
}

/**
 * Download a model file from the user's Nextcloud storage.
 * @param {{ dav_path?: string, file_id?: number }} params
 * @returns {Promise<Blob>}
 */
export async function fetchModelBlob(params) {
	const response = await fetch(`${base()}/fetch`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(params),
		credentials: 'same-origin',
	})
	if (!response.ok) {
		const err = await response.json().catch(() => ({}))
		throw new Error(err.message || err.error || `Download failed (${response.status})`)
	}
	return response.blob()
}
