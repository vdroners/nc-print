import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'

const base = () => generateUrl('/apps/nc_print/api/printer')

/**
 * @returns {Promise<object>} Aggregated printer state from Moonraker.
 */
export async function fetchState() {
	const { data } = await axios.get(`${base()}/state`)
	return data
}

export async function pausePrint() {
	const { data } = await axios.post(`${base()}/pause`)
	return data
}

export async function resumePrint() {
	const { data } = await axios.post(`${base()}/resume`)
	return data
}

export async function cancelPrint() {
	const { data } = await axios.post(`${base()}/cancel`)
	return data
}

/**
 * @returns {string|null} Camera stream URL when configured.
 */
export async function uploadAndStart(gcode, filename, start = false) {
	const form = new FormData()
	form.append('file', gcode, filename)
	form.append('start', start ? '1' : '0')
	const { data } = await axios.post(`${base()}/upload`, form, {
		headers: { 'Content-Type': 'multipart/form-data' },
	})
	return data
}

export function cameraStreamUrl(config) {
	return config?.camera_url || config?.cameraUrl || config?.webcamUrl || null
}
