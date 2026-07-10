/**
 * Pure service-health helpers shared by ServiceHealthBanner and its tests.
 * Health chrome renders ONLY when something is broken (WS3).
 */

/**
 * @param {object} status appStatus ({ slicer_ok, moonraker_ok, ... })
 * @param {{has3mfError?:boolean, hasGcodeDownloadError?:boolean}} [flags]
 * @returns {boolean} true when everything is healthy (banner should be empty)
 */
export function isHealthy(status = {}, flags = {}) {
	const moonrakerOk = !!status.moonraker_ok || !!flags.targetPrinterConnected
	return !!status.slicer_ok
		&& moonrakerOk
		&& !flags.has3mfError
		&& !flags.hasGcodeDownloadError
}

/**
 * Build the list of recovery-card descriptors for the current fault state.
 * Retry handlers are attached by the component; this returns kind + detail.
 * @param {object} status appStatus
 * @param {object} [ctx] { has3mfError, convertError, hasGcodeDownloadError, gcodeError }
 * @returns {Array<{kind:string, detail:string}>}
 */
export function buildRecoveryCards(status = {}, ctx = {}) {
	const cards = []
	const sessionPrinters = Array.isArray(status.multi_printers) ? status.multi_printers : []
	const hasTarget = !!(
		ctx.selectedPrinterId
		|| ctx.hasTargetPrinter
		|| ctx.targetPrinterConnected
		|| sessionPrinters.length > 0
	)
	const targetLive = !!ctx.targetPrinterConnected
	if (status.loaded && status.slicer_enabled && status.slicer_configured === false) {
		cards.push({
			kind: 'slicer_setup',
			detail: 'Set the slicer URL in Admin → NC 3D Print, or deploy the nc-print-slicer container.',
		})
	} else if (status.loaded && status.slicer_enabled && !status.slicer_ok) {
		cards.push({ kind: 'slicer_offline', detail: status.slicer_error || '' })
	}
	if (status.loaded && status.moonraker_enabled && status.moonraker_configured === false && !hasTarget) {
		cards.push({
			kind: 'moonraker_setup',
			detail: 'Scan for printers on Prepare and click Use, or set a Moonraker URL in Admin.',
		})
	} else if (status.loaded && status.moonraker_enabled && !status.moonraker_ok && !targetLive) {
		cards.push({ kind: 'moonraker_offline', detail: status.moonraker_error || '' })
	}
	if (ctx.has3mfError) {
		cards.push({ kind: '3mf_fail', detail: ctx.convertError || '' })
	}
	if (ctx.hasGcodeDownloadError) {
		cards.push({ kind: 'gcode_download_fail', detail: ctx.gcodeError || '' })
	}
	return cards
}
