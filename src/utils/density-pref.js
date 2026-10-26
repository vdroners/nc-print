/**
 * Comfortable vs Ultrawide content-budget preference for NC Print.
 *
 * Ultrawide (default) lets CSS media queries raise --nc-print-content-max.
 * Comfortable forces the classic 1680px cap via data-density on #nc-print-root.
 */
export const DENSITY_KEY = 'nc_print_density'
export const DENSITY_COMFORTABLE = 'comfortable'
export const DENSITY_ULTRAWIDE = 'ultrawide'

/** @returns {'comfortable'|'ultrawide'} */
export function readDensityPref() {
	try {
		const raw = localStorage.getItem(DENSITY_KEY)
		if (raw === DENSITY_COMFORTABLE || raw === DENSITY_ULTRAWIDE) {
			return raw
		}
	} catch {
		// private browsing
	}
	return DENSITY_ULTRAWIDE
}

/**
 * @param {'comfortable'|'ultrawide'} mode
 * @returns {'comfortable'|'ultrawide'}
 */
export function writeDensityPref(mode) {
	const next = mode === DENSITY_COMFORTABLE ? DENSITY_COMFORTABLE : DENSITY_ULTRAWIDE
	try {
		localStorage.setItem(DENSITY_KEY, next)
	} catch {
		// ignore
	}
	if (typeof window !== 'undefined') {
		window.dispatchEvent(new CustomEvent('nc-print-density-changed', { detail: { density: next } }))
	}
	return next
}

/**
 * Flip Comfortable <-> Ultrawide and persist.
 * @returns {'comfortable'|'ultrawide'}
 */
export function toggleDensityPref() {
	const cur = readDensityPref()
	return writeDensityPref(cur === DENSITY_COMFORTABLE ? DENSITY_ULTRAWIDE : DENSITY_COMFORTABLE)
}

/**
 * Stamp data-density on the SPA root so CSS can force Comfortable.
 * @param {'comfortable'|'ultrawide'} [mode]
 * @param {HTMLElement|null} [root]
 */
export function applyDensityToRoot(mode, root) {
	const el = root || (typeof document !== 'undefined' ? document.getElementById('nc-print-root') : null)
	if (!el) {
		return
	}
	const value = mode || readDensityPref()
	el.setAttribute('data-density', value)
}

/** Human label for chrome / palette. */
export function densityLabel(mode) {
	return mode === DENSITY_COMFORTABLE ? 'Comfortable' : 'Ultrawide'
}
