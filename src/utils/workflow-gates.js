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
	return !!(state.printerState && state.printerState.connected)
		|| !!(state.appStatus && state.appStatus.moonraker_enabled)
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
	const meshState = state.meshState || {}

	if (!model.file) {
		return 'Load a model on Prepare first'
	}
	if (String(model.name || '').toLowerCase().endsWith('.3mf') && !model.sliceFile) {
		return model.convertError || '3MF mesh extraction in progress or failed'
	}
	if (previewBlocked(state)) {
		return 'No mesh preview — re-import or wait for 3MF extraction'
	}
	if (meshState.dirty) {
		return 'Apply viewport transform before slicing'
	}
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
	const meshState = state.meshState || {}

	const slicerOk = appStatus.loaded && appStatus.slicer_enabled && appStatus.slicer_ok
	if (!model.file) {
		return false
	}
	if (previewBlocked(state)) {
		return false
	}
	const meshReady = !model.file
		|| (
			(!String(model.name || '').toLowerCase().endsWith('.3mf') || !!model.sliceFile)
			&& !model.convertError
			&& !meshState.dirty
		)
	return !!model.file
		&& meshReady
		&& !!selection.printerId
		&& !!selection.filamentId
		&& !!selection.processId
		&& !!state.selectedPrinterId
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
	const meshState = state.meshState || {}

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
					&& !meshState.dirty
				),
			label: 'Slice-ready mesh',
			hint: model.convertError
				|| (meshState.dirty ? 'Apply viewport transform to slice mesh' : '3MF mesh extraction failed — export STL'),
		},
		{ ok: !!selection.printerId, label: 'Slicer profile', hint: 'Choose a slicer profile on Prepare' },
		{ ok: !!selection.filamentId, label: 'Filament profile', hint: 'Choose a filament profile' },
		{ ok: !!selection.processId, label: 'Process profile', hint: 'Choose a process profile' },
		{ ok: !!state.selectedPrinterId, label: 'Target printer', hint: 'Choose a target printer on Prepare' },
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
	return 8
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
	const meshState = state.meshState || {}
	const slicerOk = appStatus.loaded && appStatus.slicer_enabled && appStatus.slicer_ok
	const rows = [
		!!model.file,
		!previewBlocked(state),
		!model.file
			|| (
				(!String(model.name || '').toLowerCase().endsWith('.3mf') || !!model.sliceFile)
				&& !model.convertError
				&& !meshState.dirty
			),
		!!selection.printerId,
		!!selection.filamentId,
		!!selection.processId,
		!!state.selectedPrinterId,
		!!slicerOk,
	]
	const ready = rows.filter(Boolean).length
	return { ready, total: rows.length }
}
