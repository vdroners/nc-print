import { describe, it, expect } from 'vitest'
import { parsePrintableArea } from '@/utils/bed-shape.js'

describe('parsePrintableArea', () => {
	it('parses a square K1 Max bed', () => {
		expect(parsePrintableArea('0x0,300x0,300x300,0x300', 300)).toEqual([300, 300, 300])
	})

	it('parses a non-square bed (X != Y)', () => {
		expect(parsePrintableArea('0x0,256x0,256x256,0x256', 256)).toEqual([256, 256, 256])
		expect(parsePrintableArea('0x0,220x0,220x250,0x250', 240)).toEqual([220, 250, 240])
	})

	it('accepts an already-split array of corner strings', () => {
		expect(parsePrintableArea(['0x0', '300x0', '300x300', '0x300'], '300')).toEqual([300, 300, 300])
	})

	it('handles a non-zero origin (uses extent, not max)', () => {
		expect(parsePrintableArea('-2x-2,304x-2,304x304,-2x304', 305)).toEqual([306, 306, 305])
	})

	it('falls back z to the larger XY footprint when height is missing/invalid', () => {
		expect(parsePrintableArea('0x0,300x0,300x200,0x200', undefined)).toEqual([300, 200, 300])
		expect(parsePrintableArea('0x0,300x0,300x200,0x200', 'abc')).toEqual([300, 200, 300])
	})

	it('returns null for unparseable / empty input', () => {
		expect(parsePrintableArea('', 300)).toBeNull()
		expect(parsePrintableArea(null, 300)).toBeNull()
		expect(parsePrintableArea('garbage', 300)).toBeNull()
		expect(parsePrintableArea('0x0', 300)).toBeNull() // single point → zero extent
	})

	it('parses float coordinates', () => {
		expect(parsePrintableArea('0x0,306.5x0,306.5x306,0x306', 305)).toEqual([306.5, 306, 305])
	})
})
