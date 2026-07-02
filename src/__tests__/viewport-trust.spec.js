import { describe, it, expect } from 'vitest'
import { formatBedDimensions, formatBedLegend } from '@/utils/viewport-format.js'

describe('viewport trust — bed legend (G33b)', () => {
	it('formats the default 220x220 bed footprint', () => {
		expect(formatBedDimensions([220, 220, 220])).toBe('220×220')
	})

	it('rounds non-integer volumes', () => {
		expect(formatBedDimensions([235.6, 234.4, 250])).toBe('236×234')
	})

	it('is resilient to missing/short volumes', () => {
		expect(formatBedDimensions()).toBe('0×0')
		expect(formatBedDimensions([300])).toBe('300×0')
	})

	it('builds the full legend line with origin hint', () => {
		expect(formatBedLegend([300, 300, 400])).toBe('Bed 300×300 mm · origin front-left')
	})
})
