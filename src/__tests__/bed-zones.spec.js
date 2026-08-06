import { describe, it, expect } from 'vitest'
import { normalizeZone, zoneIntersectsRect, rectInAnyZone } from '../utils/bed-zones.js'

describe('bed exclusion zones (Wave D)', () => {
	describe('normalizeZone', () => {
		it('accepts a valid zone and coerces numerics', () => {
			expect(normalizeZone({ x: '10', y: 20, w: '30', h: 40 }))
				.toEqual({ x: 10, y: 20, w: 30, h: 40 })
		})

		it('rejects zero/negative sizes and non-numeric fields', () => {
			expect(normalizeZone({ x: 0, y: 0, w: 0, h: 10 })).toBeNull()
			expect(normalizeZone({ x: 0, y: 0, w: 10, h: -1 })).toBeNull()
			expect(normalizeZone({ x: 'abc', y: 0, w: 10, h: 10 })).toBeNull()
			expect(normalizeZone(null)).toBeNull()
		})
	})

	describe('zoneIntersectsRect', () => {
		const zone = { x: 100, y: 100, w: 50, h: 50 }

		it('detects an overlapping footprint', () => {
			expect(zoneIntersectsRect(zone, { minX: 120, minY: 120, maxX: 180, maxY: 180 })).toBe(true)
		})

		it('detects a rect fully inside the zone', () => {
			expect(zoneIntersectsRect(zone, { minX: 110, minY: 110, maxX: 140, maxY: 140 })).toBe(true)
		})

		it('detects a zone fully inside the rect', () => {
			expect(zoneIntersectsRect(zone, { minX: 0, minY: 0, maxX: 220, maxY: 220 })).toBe(true)
		})

		it('does not fire on a disjoint rect', () => {
			expect(zoneIntersectsRect(zone, { minX: 0, minY: 0, maxX: 50, maxY: 50 })).toBe(false)
		})

		it('touching edges do not count as overlap', () => {
			// Part flush against the keep-out boundary is legal placement.
			expect(zoneIntersectsRect(zone, { minX: 0, minY: 0, maxX: 100, maxY: 100 })).toBe(false)
			expect(zoneIntersectsRect(zone, { minX: 150, minY: 100, maxX: 200, maxY: 150 })).toBe(false)
		})

		it('ignores invalid zones', () => {
			expect(zoneIntersectsRect({ x: 0, y: 0, w: 0, h: 0 }, { minX: 0, minY: 0, maxX: 10, maxY: 10 })).toBe(false)
		})
	})

	describe('rectInAnyZone', () => {
		const zones = [
			{ x: 0, y: 0, w: 30, h: 30 },
			{ x: 200, y: 200, w: 20, h: 20 },
		]

		it('true when the rect hits any zone in the list', () => {
			expect(rectInAnyZone(zones, { minX: 10, minY: 10, maxX: 40, maxY: 40 })).toBe(true)
			expect(rectInAnyZone(zones, { minX: 205, minY: 205, maxX: 215, maxY: 215 })).toBe(true)
		})

		it('false when the rect avoids every zone (or the list is empty)', () => {
			expect(rectInAnyZone(zones, { minX: 100, minY: 100, maxX: 150, maxY: 150 })).toBe(false)
			expect(rectInAnyZone([], { minX: 0, minY: 0, maxX: 500, maxY: 500 })).toBe(false)
			expect(rectInAnyZone(null, { minX: 0, minY: 0, maxX: 500, maxY: 500 })).toBe(false)
		})
	})
})
