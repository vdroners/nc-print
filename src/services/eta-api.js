/**
 * Smart ETA client.
 *
 * Predicts an adjusted print duration from the slicer estimate + this printer's
 * learned slicer-vs-actual history, and records completed prints so the model
 * improves over time. Learning state lives server-side in app-config
 * (EtaLearningService) — this is just the thin transport.
 */
import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'

const apiBase = () => generateUrl('/apps/nc_print/api/eta')

/**
 * @param {object} opts
 * @param {number} opts.slicerMinutes
 * @param {string} [opts.printerId]
 * @param {string} [opts.material]
 * @param {number} [opts.nozzleDiameter]
 * @returns {Promise<{predicted_minutes:number, slicer_minutes:number, multiplier:number, samples:number, confidence:number}>}
 */
export async function predictEta({ slicerMinutes, printerId, material, nozzleDiameter }) {
	const { data } = await axios.post(`${apiBase()}/predict`, {
		slicer_minutes: slicerMinutes,
		printer_id: printerId || '',
		material: material || '',
		nozzle_diameter: nozzleDiameter ?? '',
	})
	return data
}

/**
 * Record a finished print so the (printer, material, nozzle) bucket learns.
 * @param {object} opts
 * @param {number} opts.slicerMinutes
 * @param {number} opts.actualMinutes
 * @param {string} [opts.printerId]
 * @param {string} [opts.material]
 * @param {number} [opts.nozzleDiameter]
 * @returns {Promise<{ok:boolean, recorded:boolean, bucket?:object}>}
 */
export async function recordEta({ slicerMinutes, actualMinutes, printerId, material, nozzleDiameter }) {
	const { data } = await axios.post(`${apiBase()}/record`, {
		slicer_minutes: slicerMinutes,
		actual_minutes: actualMinutes,
		printer_id: printerId || '',
		material: material || '',
		nozzle_diameter: nozzleDiameter ?? '',
	})
	return data
}
