/**
 * Per-user "pinned panels" preference for the Print tab.
 *
 * Pinned panel ids float to a "Pinned" zone at the top of the Print tab. Stored
 * as a JSON array of panel ids under one localStorage key. Pure + framework-free
 * (mirrors utils/collapsible.js) so the component and its unit tests share it.
 */

const KEY = 'nc_print_pinned_panels'

/** Cap so the pinned zone can't grow unbounded. */
export const MAX_PINNED = 8

/**
 * Read the pinned panel ids (in pin order). Returns [] when nothing is stored
 * or storage/JSON is unavailable/corrupt.
 * @returns {string[]}
 */
export function loadPinned() {
	try {
		const raw = localStorage.getItem(KEY)
		if (!raw) {
			return []
		}
		const arr = JSON.parse(raw)
		if (!Array.isArray(arr)) {
			return []
		}
		// keep only strings, de-dupe, cap.
		const seen = new Set()
		const out = []
		for (const v of arr) {
			if (typeof v === 'string' && v && !seen.has(v)) {
				seen.add(v)
				out.push(v)
				if (out.length >= MAX_PINNED) {
					break
				}
			}
		}
		return out
	} catch {
		return []
	}
}

/**
 * Persist the pinned panel ids. Silently no-ops if storage is unavailable.
 * @param {string[]} ids
 */
export function savePinned(ids) {
	try {
		const clean = Array.isArray(ids)
			? [...new Set(ids.filter((v) => typeof v === 'string' && v))].slice(0, MAX_PINNED)
			: []
		localStorage.setItem(KEY, JSON.stringify(clean))
	} catch {
		// ignore
	}
}

/**
 * Toggle a panel id's pinned state and persist. Returns the new pinned list.
 * @param {string} id
 * @returns {string[]}
 */
export function togglePinned(id) {
	const cur = loadPinned()
	const idx = cur.indexOf(id)
	let next
	if (idx >= 0) {
		next = cur.filter((v) => v !== id)
	} else {
		next = [...cur, id].slice(0, MAX_PINNED)
	}
	savePinned(next)
	return next
}

/**
 * @param {string[]} pinned
 * @param {string} id
 * @returns {boolean}
 */
export function isPinned(pinned, id) {
	return Array.isArray(pinned) && pinned.includes(id)
}
