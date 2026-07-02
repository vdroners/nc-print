import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'

const base = () => generateUrl('/apps/nc_print/api/printer')
const proxyBase = () => generateUrl('/apps/nc_print/api/moonraker')

/**
 * Read-only GET through the Moonraker proxy allowlist (Part B reads).
 * @param {string} path Moonraker path (e.g. 'server/temperature_store')
 * @param {object} [params] query params
 * @param {string} [printerId]
 * @returns {Promise<object>}
 */
export async function moonrakerGet(path, params = {}, printerId) {
	const q = printerId ? { ...params, printer_id: printerId } : params
	const { data } = await axios.get(`${proxyBase()}/${path}`, { params: q })
	return data
}

/**
 * POST through the Moonraker proxy allowlist (e.g. job_queue add/remove).
 * Never used for gcode — those go through guarded PrinterController actions.
 * @param {string} path
 * @param {object} [body]
 * @param {string} [printerId]
 * @returns {Promise<object>}
 */
export async function moonrakerProxyPost(path, body = {}, printerId) {
	const params = printerId ? { printer_id: printerId } : {}
	const { data } = await axios.post(`${proxyBase()}/${path}`, body, { params })
	return data
}

function printerParams(printerId, extra = {}) {
	const params = { ...extra }
	if (printerId) {
		params.printer_id = printerId
	}
	return params
}

/**
 * @returns {Promise<object>} Aggregated printer state from Moonraker.
 * @param {string} [printerId] multi_printer id from admin config
 */
export async function fetchState(printerId) {
	const params = printerId ? { printer_id: printerId } : {}
	const { data } = await axios.get(`${base()}/state`, { params })
	return data
}

export async function pausePrint(printerId) {
	const params = printerId ? { printer_id: printerId } : {}
	const { data } = await axios.post(`${base()}/pause`, null, { params })
	return data
}

export async function resumePrint(printerId) {
	const params = printerId ? { printer_id: printerId } : {}
	const { data } = await axios.post(`${base()}/resume`, null, { params })
	return data
}

export async function cancelPrint(printerId) {
	const params = printerId ? { printer_id: printerId } : {}
	const { data } = await axios.post(`${base()}/cancel`, null, { params })
	return data
}

/**
 * @param {object} body
 * @param {string} [body.action]
 * @param {number|string} [body.value]
 * @param {string} [body.axis]
 * @param {number|string} [body.distance]
 * @param {string} [printerId]
 */
export async function gcodeAction(body, printerId) {
	const params = printerParams(printerId)
	const { data } = await axios.post(`${base()}/gcode-action`, body, { params })
	return data
}

export async function setTemperature({ nozzle, bed } = {}, printerId) {
	const params = printerParams(printerId)
	const payload = {}
	if (nozzle != null && nozzle !== '') {
		payload.nozzle = nozzle
	}
	if (bed != null && bed !== '') {
		payload.bed = bed
	}
	const { data } = await axios.post(`${base()}/temperature`, payload, { params })
	return data
}

export async function setExtruderTemp(celsius, printerId) {
	return setTemperature({ nozzle: celsius }, printerId)
}

export async function setBedTemp(celsius, printerId) {
	return setTemperature({ bed: celsius }, printerId)
}

export async function cooldown(printerId) {
	return setTemperature({ nozzle: 0, bed: 0 }, printerId)
}

export async function setSpeedFactor(percent, printerId) {
	return gcodeAction({ action: 'tune_speed', value: percent }, printerId)
}

export async function setFlowFactor(percent, printerId) {
	return gcodeAction({ action: 'tune_flow', value: percent }, printerId)
}

export async function setFanSpeed(pwm0to255, printerId) {
	return gcodeAction({ action: 'tune_fan', value: pwm0to255 }, printerId)
}

export async function babystepZ(mm, printerId) {
	const delta = Number(mm)
	if (!Number.isFinite(delta) || delta === 0) {
		return null
	}
	return gcodeAction({ action: 'babystep_z', value: delta }, printerId)
}

export async function homeAll(printerId) {
	return gcodeAction({ action: 'home_all' }, printerId)
}

export async function homeZ(printerId) {
	return gcodeAction({ action: 'home_z' }, printerId)
}

export async function jogAxis(axis, distanceMm, printerId) {
	const dist = Number(distanceMm)
	if (!Number.isFinite(dist) || dist === 0) {
		return null
	}
	return gcodeAction({ action: 'jog', axis, distance: dist }, printerId)
}

export async function disableSteppers(printerId) {
	return gcodeAction({ action: 'disable_steppers' }, printerId)
}

// Part B guarded write actions (WS12/WS13/WS14/WS10). Each maps to a fixed,
// parameterised script server-side — never a raw passthrough.

export async function bedMeshCalibrate(printerId) {
	return gcodeAction({ action: 'bed_mesh_calibrate' }, printerId)
}

export async function excludeObject(name, printerId) {
	return gcodeAction({ action: 'exclude_object', name }, printerId)
}

export async function filamentLoad(printerId) {
	return gcodeAction({ action: 'filament_load' }, printerId)
}

export async function filamentUnload(printerId) {
	return gcodeAction({ action: 'filament_unload' }, printerId)
}

export async function filamentPurge(printerId) {
	return gcodeAction({ action: 'filament_purge' }, printerId)
}

export async function setHeaterTemp(heater, target, printerId) {
	return gcodeAction({ action: 'set_heater_temp', heater, target }, printerId)
}

export async function pidCalibrate(heater, target, printerId) {
	return gcodeAction({ action: 'pid_calibrate', heater, target }, printerId)
}

/**
 * WS11: arbitrary G-code console send. Server rejects with 403 unless the
 * admin has enabled the console (`console_enabled`).
 * @param {string} command single-line printable-ASCII command (<=256 chars)
 * @param {string} [printerId]
 * @returns {Promise<object>}
 */
export async function consoleCommand(command, printerId) {
	const params = printerId ? { printer_id: printerId } : {}
	const { data } = await axios.post(`${base()}/console`, { command }, { params })
	return data
}

export async function emergencyStop(printerId) {
	const params = printerId ? { printer_id: printerId } : {}
	const { data } = await axios.post(`${base()}/emergency-stop`, null, { params })
	return data
}

export async function uploadAndStart(gcode, filename, start = false, printerId) {
	const form = new FormData()
	form.append('file', gcode, filename)
	form.append('start', start ? '1' : '0')
	const params = printerId ? { printer_id: printerId } : {}
	const { data } = await axios.post(`${base()}/upload`, form, {
		headers: { 'Content-Type': 'multipart/form-data' },
		params,
	})
	return data
}

/**
 * @returns {string} Server-side camera proxy URL (never a raw LAN address).
 * @param {object} [_config] unused; kept for call-site compatibility
 * @param {string} [printerId] multi_printer id from admin config
 */
export function cameraProxyUrl(_config, printerId) {
	const url = generateUrl('/apps/nc_print/api/camera/frame.jpeg')
	if (!printerId) {
		return url
	}
	return `${url}?printer_id=${encodeURIComponent(String(printerId))}`
}

/**
 * @returns {string|null} Proxied camera snapshot URL (never a raw LAN address).
 */
export function cameraStreamUrl(config, printerId) {
	return cameraProxyUrl(config, printerId)
}
