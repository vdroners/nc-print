/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
	DENSITY_KEY,
	DENSITY_COMFORTABLE,
	DENSITY_ULTRAWIDE,
	readDensityPref,
	writeDensityPref,
	toggleDensityPref,
	applyDensityToRoot,
	densityLabel,
} from '@/utils/density-pref.js'

describe('density-pref', () => {
	beforeEach(() => {
		localStorage.clear()
		document.body.innerHTML = '<div id="nc-print-root"></div>'
	})

	afterEach(() => {
		localStorage.clear()
	})

	it('defaults to Ultrawide when unset', () => {
		expect(readDensityPref()).toBe(DENSITY_ULTRAWIDE)
	})

	it('persists Comfortable / Ultrawide and stamps data-density', () => {
		writeDensityPref(DENSITY_COMFORTABLE)
		expect(localStorage.getItem(DENSITY_KEY)).toBe(DENSITY_COMFORTABLE)
		expect(readDensityPref()).toBe(DENSITY_COMFORTABLE)
		applyDensityToRoot(DENSITY_COMFORTABLE)
		expect(document.getElementById('nc-print-root').getAttribute('data-density')).toBe(
			DENSITY_COMFORTABLE,
		)

		writeDensityPref(DENSITY_ULTRAWIDE)
		applyDensityToRoot()
		expect(document.getElementById('nc-print-root').getAttribute('data-density')).toBe(
			DENSITY_ULTRAWIDE,
		)
	})

	it('toggle flips Comfortable ↔ Ultrawide', () => {
		expect(toggleDensityPref()).toBe(DENSITY_COMFORTABLE)
		expect(toggleDensityPref()).toBe(DENSITY_ULTRAWIDE)
	})

	it('dispatches nc-print-density-changed on write', () => {
		const spy = vi.fn()
		window.addEventListener('nc-print-density-changed', spy)
		writeDensityPref(DENSITY_COMFORTABLE)
		expect(spy).toHaveBeenCalled()
		expect(spy.mock.calls[0][0].detail.density).toBe(DENSITY_COMFORTABLE)
		window.removeEventListener('nc-print-density-changed', spy)
	})

	it('densityLabel is human-readable', () => {
		expect(densityLabel(DENSITY_COMFORTABLE)).toBe('Comfortable')
		expect(densityLabel(DENSITY_ULTRAWIDE)).toBe('Ultrawide')
	})
})
