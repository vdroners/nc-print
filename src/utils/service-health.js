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
	return !!status.slicer_ok
		&& !!status.moonraker_ok
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
	if (status.loaded && status.slicer_enabled && !status.slicer_ok) {
		cards.push({ kind: 'slicer_offline', detail: status.slicer_error || '' })
	}
	if (status.loaded && status.moonraker_enabled && !status.moonraker_ok) {
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
