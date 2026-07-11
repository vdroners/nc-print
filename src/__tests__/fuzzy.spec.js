import { describe, it, expect } from 'vitest'
import { fuzzyScore, fuzzyFilter } from '@/utils/fuzzy.js'

describe('fuzzyScore', () => {
	it('empty query matches everything with score 0', () => {
		expect(fuzzyScore('', 'anything')).toBe(0)
	})

	it('ranks exact > prefix > substring > subsequence', () => {
		const exact = fuzzyScore('pause', 'pause')
		const prefix = fuzzyScore('pau', 'pause print')
		const substr = fuzzyScore('print', 'pause print')
		const subseq = fuzzyScore('pp', 'pause print')
		expect(exact).toBeGreaterThan(prefix)
		expect(prefix).toBeGreaterThan(substr)
		expect(substr).toBeGreaterThan(subseq)
		expect(subseq).toBeGreaterThan(0)
	})

	it('is case-insensitive', () => {
		expect(fuzzyScore('PAUSE', 'pause')).toBe(1000)
	})

	it('returns -1 when the query is not a subsequence', () => {
		expect(fuzzyScore('zzz', 'pause print')).toBe(-1)
	})

	it('returns -1 for empty text with a non-empty query', () => {
		expect(fuzzyScore('x', '')).toBe(-1)
	})
})

describe('fuzzyFilter', () => {
	const items = [
		{ t: 'Go to Prepare' },
		{ t: 'Go to Slice' },
		{ t: 'Pause print' },
		{ t: 'Resume print' },
		{ t: 'Open Temperature' },
	]
	const key = (x) => x.t

	it('filters out non-matches and ranks best-first', () => {
		const out = fuzzyFilter('pause', items, key)
		expect(out[0].t).toBe('Pause print')
	})

	it('empty query returns all in original order', () => {
		const out = fuzzyFilter('', items, key)
		expect(out.map(key)).toEqual(items.map(key))
	})

	it('no match returns empty', () => {
		expect(fuzzyFilter('zzzzz', items, key)).toEqual([])
	})

	it('prefix beats subsequence for the same query', () => {
		const out = fuzzyFilter('go', items, key)
		// "Go to Prepare"/"Go to Slice" (prefix) rank above any subsequence-only hit
		expect(out[0].t.startsWith('Go to')).toBe(true)
	})
})
