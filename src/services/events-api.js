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
 * @param {'complete'|'error'|'started'|'cancel'} opts.transition
 * @param {string} [opts.filename]
 * @param {string} [opts.printer]
 * @param {number} [opts.durationS] actual print duration in seconds
 * @param {string} [opts.printerId]
 * @param {string} [opts.printerName]
 * @param {string} [opts.material]
 * @param {number} [opts.nozzleDiameter]
 * @param {string} [opts.failureReason]
 * @param {number} [opts.slicerDurationS] slicer time estimate in seconds
 * @param {number} [opts.filamentG] slicer filament estimate in grams
 * @param {number} [opts.filamentMm] slicer filament estimate in mm
 * @param {number} [opts.layerHeight]
 * @returns {Promise<object>}
 */
export async function notifyPrintTransition(opts) {
	const {
		transition, filename, printer, durationS,
		printerId, printerName, material, nozzleDiameter, failureReason,
		slicerDurationS, filamentG, filamentMm, layerHeight,
	} = opts
	const { data } = await axios.post(`${apiBase()}/print-transition`, {
		transition,
		filename: filename || '',
		printer: printer || '',
		duration_s: durationS ?? '',
		// Enriched history context (all optional; server persists what it gets).
		printer_id: printerId || '',
		printer_name: printerName || '',
		material: material || '',
		nozzle_diameter: nozzleDiameter ?? '',
		failure_reason: failureReason || '',
		slicer_duration_s: slicerDurationS ?? '',
		filament_g: filamentG ?? '',
		filament_mm: filamentMm ?? '',
		layer_height: layerHeight ?? '',
	})
	return data
}
