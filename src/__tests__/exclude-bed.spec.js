import { describe, expect, it } from 'vitest'
import {
	assignObjectLabels,
	bedGlyph,
	layoutExcludeBed,
	objectMarker,
	shortObjectLabel,
	visibleObjectLabel,
} from '@/utils/exclude-bed.js'

const CONE_A = 'REAR_CONE_V4_-_REAR_CONE_1_.STEP_A_ID_0_COPY_0'
const CONE_B = 'REAR_CONE_V4_-_REAR_CONE_1_.STEP_B_ID_1_COPY_0'

describe('exclude-object bed labels', () => {
	it('turns long gcode object names into A/B', () => {
		const labeled = assignObjectLabels([{ name: CONE_A }, { name: CONE_B }])
		expect(labeled.map((item) => item.marker)).toEqual(['A', 'B'])
		expect(labeled.map((item) => item.shortLabel)).toEqual(['A', 'B'])
		expect(bedGlyph(labeled[0].shortLabel, labeled[0].marker)).toBe('A')
		expect(bedGlyph(labeled[1].shortLabel, labeled[1].marker)).toBe('B')
		expect(labeled.map(visibleObjectLabel)).toEqual(['A', 'B'])
		expect(visibleObjectLabel(labeled[0])).not.toContain('REAR_CONE')
	})

	it('keeps a readable tail when there is no single letter', () => {
		expect(shortObjectLabel('part_1', ['part_1', 'part_2'])).toBe('1')
		expect(shortObjectLabel('part_2', ['part_1', 'part_2'])).toBe('2')
		expect(shortObjectLabel('body', ['body', 'lid'])).toBe('body')
		expect(shortObjectLabel('lid', ['body', 'lid'])).toBe('lid')
		expect(bedGlyph('body', 'A')).toBe('body')
		expect(bedGlyph('left housing', 'A')).toBe('A')
	})

	it('disambiguates identical short labels with the letter badge', () => {
		const labeled = assignObjectLabels([{ name: 'aaa' }, { name: 'aaa' }])
		expect(labeled.map((item) => item.shortLabel)).toEqual(['A', 'B'])
		expect(objectMarker(26)).toBe('27')
	})
})

describe('exclude-object bed layout', () => {
	const cones = [
		{ name: CONE_A, center: [80, 150], polygon: [[60, 120], [100, 120], [100, 180], [60, 180]] },
		{ name: CONE_B, center: [220, 150], polygon: [[200, 120], [250, 120], [250, 180], [200, 180]] },
	]

	it('places front-left below back-right and keeps left/right order', () => {
		const bed = layoutExcludeBed([
			{ name: 'front', center: [20, 10] },
			{ name: 'back', center: [20, 280] },
			{ name: 'right', center: [260, 150] },
		], { width: 300, depth: 300 })
		const front = bed.items.find((item) => item.name === 'front')
		const back = bed.items.find((item) => item.name === 'back')
		const right = bed.items.find((item) => item.name === 'right')
		expect(front.placed).toBe(true)
		expect(front.points).toBeNull()
		expect(front.cy).toBeGreaterThan(back.cy)
		expect(front.cx).toBeCloseTo(back.cx)
		expect(front.cx).toBeLessThan(right.cx)
		expect(bed.bedWidth).toBe(300)
		expect(bed.bedDepth).toBe(300)
		expect(bed.ariaLabel).toMatch(/front at the bottom/)
	})

	it('draws polygons, marks printing vs excluded, and defaults the bed to 300', () => {
		const bed = layoutExcludeBed([
			{ ...cones[0], excluded: false },
			{ ...cones[1], excluded: true },
		], { currentObject: CONE_A })
		const a = bed.placed.find((item) => item.name === CONE_A)
		const b = bed.placed.find((item) => item.name === CONE_B)
		expect(a.points).toBeTruthy()
		expect(a.status).toBe('printing')
		expect(a.glyph).toBe('A')
		expect(b.status).toBe('excluded')
		expect(b.glyph).toBe('B')
		expect(a.cx).toBeLessThan(b.cx)
		const pairs = a.points.split(' ').map((pair) => pair.split(',').map(Number))
		// Polygon order is front edge (machine y 120) then back edge (machine y 180).
		// Front must sit lower on the screen.
		expect(pairs[0][1]).toBeGreaterThan(pairs[2][1])
		expect(bed.unplaced).toEqual([])
	})

	it('lets excluded win when that part is also current', () => {
		const bed = layoutExcludeBed(
			[{ name: 'only', center: [10, 10], excluded: true }],
			{ width: 300, depth: 300, currentObject: 'only' },
		)
		expect(bed.items[0].status).toBe('excluded')
	})

	it('expands the view when a part sits outside the configured bed', () => {
		const inside = layoutExcludeBed([{ name: 'in', center: [10, 10] }], { width: 300, depth: 300 })
		const outside = layoutExcludeBed([{ name: 'out', center: [420, 10] }], { width: 300, depth: 300 })
		const insideSpan = Number(inside.viewBox.split(' ')[2])
		const outsideSpan = Number(outside.viewBox.split(' ')[2])
		expect(outsideSpan).toBeGreaterThan(insideSpan)
		expect(outside.plate.width).toBe(300)
	})

	it('reports parts that have no center or polygon', () => {
		const bed = layoutExcludeBed([
			{ name: 'known', center: [40, 40] },
			{ name: 'mystery' },
		], { width: 220, depth: 220 })
		expect(bed.placed.map((item) => item.name)).toEqual(['known'])
		expect(bed.unplaced).toEqual(['mystery'])
		expect(bed.items).toHaveLength(2)
		expect(bed.items[1].status).toBe('waiting')
	})

	it('uses 300 mm when the bed size is missing', () => {
		const bed = layoutExcludeBed([{ name: 'solo', center: [1, 1] }], {})
		expect(bed.bedWidth).toBe(300)
		expect(bed.bedDepth).toBe(300)
	})
})
