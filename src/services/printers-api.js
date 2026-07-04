/**
 * In-app printer discovery client.
 *
 * Runs the same Moonraker LAN sweep as the admin settings page, but through a
 * group-gated app endpoint so the printer picker can offer a "Scan for printers"
 * button. Read-only — it returns found candidates; adding one to the saved
 * config stays an admin action.
 */
import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'

const apiBase = () => generateUrl('/apps/nc_print/api/printers')
const printerApiBase = () => generateUrl('/apps/nc_print/api/printer')

/**
 * Discover Moonraker printers on the LAN.
 * @param {object} [opts]
 * @param {string} [opts.hosts]  explicit space/comma-separated host list (overrides the sweep)
 * @param {string} [opts.subnet] a `10.0.0.` style /24 prefix to sweep
 * @returns {Promise<Array<{host:string, moonraker_url:string, klippy_state:string, moonraker_version:string, hostname:string}>>}
 */
export async function discoverPrinters(opts = {}) {
	const body = {}
	if (opts.hosts) {
		body.hosts = opts.hosts
	}
	if (opts.subnet) {
		body.subnet = opts.subnet
	}
	const { data } = await axios.post(`${apiBase()}/discover`, body)
	return data.printers || []
}

/**
 * Detect a printer's real capabilities live from Moonraker/Klipper (build
 * volume, extruder count, model/OS). Returns the capabilities object or null.
 * @param {string} [printerId]
 * @returns {Promise<object|null>}
 */
export async function fetchCapabilities(printerId = '') {
	const url = printerId
		? `${printerApiBase()}/capabilities?printer_id=${encodeURIComponent(printerId)}`
		: `${printerApiBase()}/capabilities`
	const { data } = await axios.get(url)
	return data.capabilities || null
}
