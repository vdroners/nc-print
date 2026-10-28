/**
 * Print-tab liveness. Moonraker keeps print_stats.filename (and progress)
 * after a job stops — that is leftover state, not a live job. Live Pause /
 * Resume / Cancel follow printerControls.isActive (printing | paused) only.
 */

/** Panels that stay collapsed on an idle machine, even if saved open. */
export const IDLE_COLLAPSED_PANEL_IDS = ['temperature', 'motion', 'bedmesh']

/**
 * Same rounding as the Print tab progress label: one decimal under 1%,
 * otherwise a rounded integer percent.
 * @param {number} progress 0–1
 * @returns {string}
 */
export function formatProgressPercent(progress) {
	const pct = (Number(progress) || 0) * 100
	if (pct > 0 && pct < 1) {
		return `${pct.toFixed(1)}%`
	}
	return `${Math.round(pct)}%`
}

/**
 * @param {object} printerState
 * @returns {boolean}
 */
export function hasJobFilename(printerState) {
	return String(printerState?.filename || '').trim() !== ''
}

/**
 * Live Pause / Resume / Cancel and the in-progress control card.
 * @param {{ isActive?: boolean }} controls printerControls
 * @returns {boolean}
 */
export function showLivePrintControls(controls) {
	return !!controls?.isActive
}

/**
 * A prior job is still in Moonraker stats, but the machine is not
 * printing, paused, or complete. Connected only — an offline transport
 * failure keeps the offline banner instead of a second card.
 * @param {object} printerState
 * @param {{ isActive?: boolean, isComplete?: boolean }} controls
 * @returns {boolean}
 */
export function showLastJobCard(printerState, controls) {
	if (!printerState?.connected) {
		return false
	}
	if (controls?.isActive || controls?.isComplete) {
		return false
	}
	return hasJobFilename(printerState)
}

/**
 * Connected, nothing running, no leftover filename.
 * @param {object} printerState
 * @param {{ isActive?: boolean, isComplete?: boolean }} controls
 * @returns {boolean}
 */
export function showIdlePrintGuide(printerState, controls) {
	return !!printerState?.connected
		&& !controls?.isActive
		&& !controls?.isComplete
		&& !hasJobFilename(printerState)
}

/**
 * Print step subtitle. Machine state first — never the raw gcode name.
 * An active print leaves this blank: the header chip and sticky job line
 * already say Printing and the percent. Link lost, Offline, Error, and Idle
 * stay so a dead link is not another "Printing" chip.
 * A recent successful reading says Link lost instead of a cold Offline.
 * @param {object} printerState
 * @param {{ atMs?: number }|null} [lastContact]
 * @returns {string}
 */
export function printWorkflowSubtitle(printerState, lastContact = null) {
	const state = printerState || {}
	const st = String(state.state || '').trim().toLowerCase()
	if (!state.connected) {
		if (st === 'reconnecting') {
			return 'Reconnecting'
		}
		return lastContact?.atMs ? 'Link lost' : 'Offline'
	}
	// Printing / paused percent lives on the header chip and the sticky job
	// line. Repeating it on the workflow step buried Link lost.
	if (st === 'printing' || st === 'paused') {
		return ''
	}
	if (st === 'error') {
		return 'Error'
	}
	return 'Idle'
}

/**
 * Klipper display text wins. lastError is the transport failure
 * (offline / poll) and only fills in when message is empty.
 * @param {object} printerState
 * @returns {string}
 */
export function lastJobMessage(printerState) {
	const message = String(printerState?.message || '').trim()
	if (message) {
		return message
	}
	return String(printerState?.lastError || '').trim()
}

/**
 * @param {string} panelId
 * @param {boolean} isActive
 * @returns {boolean}
 */
export function panelForceCollapsed(panelId, isActive) {
	return !isActive && IDLE_COLLAPSED_PANEL_IDS.includes(panelId)
}

/**
 * Saved "open" must not expand Temperature / motion / bed mesh while idle.
 * @param {boolean} savedOpen
 * @param {boolean} forceCollapsed
 * @returns {boolean}
 */
export function resolvePanelOpen(savedOpen, forceCollapsed) {
	if (forceCollapsed) {
		return false
	}
	return !!savedOpen
}
