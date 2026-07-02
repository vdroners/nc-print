/**
 * Per-section collapse state persistence for NcPrintCollapsible.
 * Pure + framework-free so the component and its unit tests share it.
 */

const PREFIX = 'nc_print_collapsible_'

/** @param {string} id */
export function collapsibleStorageKey(id) {
	return `${PREFIX}${id}`
}

/**
 * Read the persisted open/closed state for a section, falling back to the
 * provided default when nothing is stored or storage is unavailable.
 * @param {string} id
 * @param {boolean} defaultOpen
 * @returns {boolean}
 */
export function loadCollapsibleState(id, defaultOpen) {
	try {
		const raw = localStorage.getItem(collapsibleStorageKey(id))
		if (raw === '1') {
			return true
		}
		if (raw === '0') {
			return false
		}
	} catch {
		// ignore
	}
	return !!defaultOpen
}

/**
 * Persist the open/closed state for a section.
 * @param {string} id
 * @param {boolean} open
 */
export function saveCollapsibleState(id, open) {
	try {
		localStorage.setItem(collapsibleStorageKey(id), open ? '1' : '0')
	} catch {
		// ignore
	}
}
