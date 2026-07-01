import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'

const base = () => generateUrl('/apps/nc_print/api/files/save-gcode')

/**
 * Save sliced G-code as a sibling of the source model in Nextcloud Files.
 * @param {object} opts
 * @param {number} [opts.file_id]
 * @param {string} [opts.dav_path]
 * @param {Blob|File} opts.gcodeBlob
 * @param {string} [opts.filename]
 */
export async function saveGcodeToFiles({ file_id, dav_path, gcodeBlob, filename }) {
	const buf = gcodeBlob instanceof Blob ? await gcodeBlob.arrayBuffer() : gcodeBlob
	const bytes = new Uint8Array(buf)
	let binary = ''
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i])
	}
	const gcode_base64 = btoa(binary)
	const { data } = await axios.post(base(), {
		file_id: file_id || undefined,
		dav_path: dav_path || undefined,
		gcode_base64,
		filename: filename || undefined,
	})
	return data
}

/**
 * Multipart upload variant for large G-code blobs.
 */
export async function saveGcodeMultipart({ file_id, dav_path, gcodeBlob, filename }) {
	const form = new FormData()
	if (file_id) {
		form.append('file_id', String(file_id))
	}
	if (dav_path) {
		form.append('dav_path', dav_path)
	}
	form.append('gcode', gcodeBlob, filename || 'model.gcode')
	const { data } = await axios.post(base(), form, {
		headers: { 'Content-Type': 'multipart/form-data' },
	})
	return data
}
