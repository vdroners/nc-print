import { describe, it, expect, beforeEach } from 'vitest'
import { loadPinned, savePinned, togglePinned, isPinned, MAX_PINNED } from '@/utils/panel-prefs.js'

describe('panel-prefs (pinned Print panels)', () => {
	beforeEach(() => {
		localStorage.clear()
	})

	it('defaults to an empty list', () => {
		expect(loadPinned()).toEqual([])
	})

	it('save then load round-trips in order', () => {
		savePinned(['temperature', 'motion', 'console'])
		expect(loadPinned()).toEqual(['temperature', 'motion', 'console'])
	})

	it('ignores corrupt JSON', () => {
		localStorage.setItem('nc_print_pinned_panels', '{not json')
		expect(loadPinned()).toEqual([])
	})

	it('ignores a non-array payload', () => {
		localStorage.setItem('nc_print_pinned_panels', '"temperature"')
		expect(loadPinned()).toEqual([])
	})

	it('de-dupes and drops non-strings on load', () => {
		localStorage.setItem('nc_print_pinned_panels', JSON.stringify(['a', 'a', 2, '', 'b']))
		expect(loadPinned()).toEqual(['a', 'b'])
	})

	it('togglePinned adds then removes', () => {
		expect(togglePinned('temperature')).toEqual(['temperature'])
		expect(togglePinned('motion')).toEqual(['temperature', 'motion'])
		expect(togglePinned('temperature')).toEqual(['motion'])
	})

	it('caps at MAX_PINNED', () => {
		const many = Array.from({ length: MAX_PINNED + 5 }, (_, i) => `p${i}`)
		savePinned(many)
		expect(loadPinned()).toHaveLength(MAX_PINNED)
		// a further pin beyond the cap is dropped (existing set already full)
		const next = togglePinned('overflow')
		expect(next).toHaveLength(MAX_PINNED)
		expect(next).not.toContain('overflow')
	})

	it('isPinned reflects membership', () => {
		expect(isPinned(['a', 'b'], 'b')).toBe(true)
		expect(isPinned(['a', 'b'], 'z')).toBe(false)
		expect(isPinned(null, 'z')).toBe(false)
	})
})
