/**
 * Pure, framework-free helpers for the Prepare/Slice/Print workflow gates.
 *
 * These mirror the logic used by the Pinia store getters so unit tests can
 * exercise the rules without instantiating the whole store, and so the store
 * and tests share a single source of truth (avoids gate drift).
 */

/**
 * Shared responsive breakpoints. Every layout container (Prepare studio,
 * WorkspaceRail, workflow banner) reflows at the same two widths.
 */
export const BREAKPOINTS = Object.freeze({
	/** Multi-column -> reduced columns. */
	multiColumn: 1200,
	/** Reduced columns -> single column. */
	singleColumn: 900,
})

/**
 * True when the loaded model has no usable slice mesh: the viewport preview
 * was skipped (unsupported format / parse failure) AND no slice blob was
 * produced (e.g. 3MF extraction). Slicing in this state would be "blind".
 * @param {object} state store-shaped state
 * @returns {boolean}
 */
export function previewBlocked(state) {
	const meta = state.modelMeta || {}
	const mesh = state.meshState || {}
	const model = state.model || {}
	if (model.sliceFile) {
		return false
	}
	return !!meta.previewSkipped && !mesh.sliceBlob
}

/**
 * WS8: True when the Print tab can be opened as a live monitor — a printer
 * is connected, or a Moonraker printer is configured. Independent of slice
 * status so an idle-but-connected printer's live view is always reachable.
 * @param {object} state
 * @returns {boolean}
 */
export function printMonitorReachable(state) {
	if (state.printerState && state.printerState.connected) {
		return true
	}
	// Wave B tighten: `moonraker_enabled` alone is not enough — there must be
	// an actual target (selected, configured list, or single-printer URL) or
	// the tab is an empty monitor with nothing to monitor.
	const appStatus = state.appStatus || {}
	if (!appStatus.moonraker_enabled) {
		return false
	}
	const cfg = state.config || {}
	const configured = Array.isArray(cfg.multi_printers) ? cfg.multi_printers : []
	return !!state.selectedPrinterId || configured.length > 0 || !!cfg.moonraker_configured
}

/**
 * True when the slicer service is loaded, enabled, and healthy.
 * @param {object} state
 * @returns {boolean}
 */
export function slicerReady(state) {
	const appStatus = state.appStatus || {}
	return !!(appStatus.loaded && appStatus.slicer_enabled && appStatus.slicer_ok)
}

/**
 * First reason (if any) that slicing is blocked. Empty string means ready.
 * @param {object} state
 * @returns {string}
 */
export function sliceBlockReason(state) {
	const model = state.model || {}
	const selection = state.selection || {}
	const appStatus = state.appStatus || {}

	if (!model.file) {
		return 'Load a model on Prepare first'
	}
	if (String(model.name || '').toLowerCase().endsWith('.3mf') && !model.sliceFile) {
		return model.convertError || '3MF mesh extraction in progress or failed'
	}
	if (previewBlocked(state)) {
		return 'No mesh preview — re-import or wait for 3MF extraction'
	}
	// Wave C: a dirty viewport transform no longer blocks — runSlice
	// auto-applies it (with a toast) before slicing.
	if (!selection.printerId || !selection.filamentId || !selection.processId) {
		return 'Select printer, filament, and process on Prepare'
	}
	if (!appStatus.loaded) {
		return 'Checking slicer status…'
	}
	if (!appStatus.slicer_enabled) {
		return 'Slicer disabled in Admin settings'
	}
	if (!appStatus.slicer_ok) {
		return 'Slicer service offline'
	}
	return ''
}

/**
 * True when Prepare is complete enough to advance to Slice.
 * @param {object} state
 * @returns {boolean}
 */
export function isPrepareComplete(state) {
	const model = state.model || {}
	const selection = state.selection || {}
	const appStatus = state.appStatus || {}

	const slicerOk = appStatus.loaded && appStatus.slicer_enabled && appStatus.slicer_ok
	if (!model.file) {
		return false
	}
	if (previewBlocked(state)) {
		return false
	}
	// Wave C: meshState.dirty intentionally does not gate — pending transforms
	// auto-apply at slice time.
	const meshReady = !model.file
		|| (
			(!String(model.name || '').toLowerCase().endsWith('.3mf') || !!model.sliceFile)
			&& !model.convertError
		)
	// Wave A: the Moonraker target printer is deliberately NOT required here.
	// Slicing is a local operation; the target only gates send/start on Print.
	return !!model.file
		&& meshReady
		&& !!selection.printerId
		&& !!selection.filamentId
		&& !!selection.processId
		&& !!slicerOk
}

/**
 * First blocker message for Prepare → Slice navigation.
 * @param {object} state
 * @returns {string}
 */
export function firstPrepareBlocker(state) {
	const model = state.model || {}
	const selection = state.selection || {}
	const appStatus = state.appStatus || {}

	for (const row of [
		{ ok: !!model.file, label: 'Model loaded', hint: 'Import or pick a file from Nextcloud' },
		{
			ok: !previewBlocked(state),
			label: 'Mesh preview available',
			hint: 'No mesh preview — re-import or wait for 3MF extraction',
		},
		{
			ok: !model.file
				|| (
					(!String(model.name || '').toLowerCase().endsWith('.3mf') || !!model.sliceFile)
					&& !model.convertError
				),
			label: 'Slice-ready mesh',
			hint: model.convertError || '3MF mesh extraction failed — export STL',
		},
		{ ok: !!selection.printerId, label: 'Slicer printer profile', hint: 'Choose a slicer printer profile on Prepare' },
		{ ok: !!selection.filamentId, label: 'Filament profile', hint: 'Choose a filament profile' },
		{ ok: !!selection.processId, label: 'Process profile', hint: 'Choose a process profile' },
		{
			ok: appStatus.loaded && appStatus.slicer_enabled && appStatus.slicer_ok,
			label: 'Slicer service',
			hint: 'Start nc-print-slicer sidecar',
		},
	]) {
		if (!row.ok) {
			return `${row.label}: ${row.hint}`
		}
	}
	return ''
}

/**
 * Rows that gate prepareComplete for checklist progress tallies.
 * @param {object} state
 * @returns {number}
 */
export function prepareChecklistGatingTotal() {
	return 7
}

/**
 * Count of gating checklist rows that pass (excludes pending + advisory).
 * @param {object} state
 * @returns {{ ready: number, total: number }}
 */
export function prepareChecklistProgress(state) {
	const model = state.model || {}
	const selection = state.selection || {}
	const appStatus = state.appStatus || {}
	const slicerOk = appStatus.loaded && appStatus.slicer_enabled && appStatus.slicer_ok
	const rows = [
		!!model.file,
		!previewBlocked(state),
		!model.file
			|| (
				(!String(model.name || '').toLowerCase().endsWith('.3mf') || !!model.sliceFile)
				&& !model.convertError
			),
		!!selection.printerId,
		!!selection.filamentId,
		!!selection.processId,
		!!slicerOk,
	]
	const ready = rows.filter(Boolean).length
	return { ready, total: rows.length }
}
