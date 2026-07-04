/**
 * Print-lifecycle event bridge.
 *
 * The store detects the printing→complete / printing→error edge and posts it
 * here so Nextcloud publishes a notification-bell entry and an Activity-stream
 * event for the current user. Best-effort — callers ignore failures.
 */
import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'

const apiBase = () => generateUrl('/apps/nc_print/api/events')

/**
 * @param {object} opts
 * @param {'complete'|'error'|'started'} opts.transition
 * @param {string} [opts.filename]
 * @param {string} [opts.printer]
 * @param {number} [opts.durationS] actual print duration in seconds
 * @returns {Promise<object>}
 */
export async function notifyPrintTransition({ transition, filename, printer, durationS }) {
	const { data } = await axios.post(`${apiBase()}/print-transition`, {
		transition,
		filename: filename || '',
		printer: printer || '',
		duration_s: durationS ?? '',
	})
	return data
}
