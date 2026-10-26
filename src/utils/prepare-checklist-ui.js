/**
 * Prepare checklist presentation (PR B cold start).
 *
 * The store already marks send-to and watertight rows `advisory`. This module
 * decides which rows are on screen and which tone they use, so an empty bed
 * does not list mesh / preview / watertight, and an advisory miss is not a
 * red blocker. Gating (`prepareChecklistProgress`, `isPrepareComplete`) stays
 * in workflow-gates.js and does not read these tones.
 */

/** Rows that have nothing to say until a model file is loaded. */
export const HIDDEN_UNTIL_MODEL = Object.freeze(['mesh', 'preview', 'watertight'])

/**
 * @param {Array<{ id: string, ok?: boolean, pending?: boolean }>} items
 * @param {{ blockingOnly?: boolean }} [opts]
 * @returns {typeof items}
 */
export function visiblePrepareChecklist(items, { blockingOnly = false } = {}) {
	const list = Array.isArray(items) ? items : []
	const modelLoaded = list.some((row) => row.id === 'model' && row.ok)
	let rows = modelLoaded
		? list
		: list.filter((row) => !HIDDEN_UNTIL_MODEL.includes(row.id))
	if (blockingOnly) {
		// Hide rows that already pass. Advisory failures stay (they are !ok
		// and not pending) so the Slice tab can show them as warnings.
		rows = rows.filter((row) => !row.ok && !row.pending)
	}
	return rows
}

/**
 * @param {{ pending?: boolean, ok?: boolean, advisory?: boolean }} row
 * @returns {'pending'|'ok'|'advisory'|'missing'}
 */
export function checklistRowTone(row) {
	if (row?.pending) {
		return 'pending'
	}
	if (row?.ok) {
		return 'ok'
	}
	if (row?.advisory) {
		return 'advisory'
	}
	return 'missing'
}

/**
 * @param {{ pending?: boolean, ok?: boolean, advisory?: boolean }} row
 * @returns {string}
 */
export function checklistRowMark(row) {
	const tone = checklistRowTone(row)
	if (tone === 'pending') {
		return '–'
	}
	if (tone === 'ok') {
		return '✓'
	}
	if (tone === 'advisory') {
		return '!'
	}
	return '✗'
}

/**
 * @param {{ pending?: boolean, ok?: boolean, advisory?: boolean, action?: string }} row
 * @returns {string[]}
 */
export function checklistRowClass(row) {
	const tone = checklistRowTone(row)
	const classes = [`nc-print-checklist__row--${tone}`]
	if (row?.action) {
		classes.push('nc-print-checklist__row--clickable')
	}
	return classes
}
