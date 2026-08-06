/**
 * Bed exclusion zones (Wave D v1): axis-aligned keep-out rectangles on the
 * build plate, in bed millimetres ({ x, y, w, h } with x/y the lower-left
 * corner). Pure helpers so the viewport, store, and unit tests share one
 * intersection rule.
 */

/**
 * Coerce a zone-ish object into a valid zone or null.
 * @param {object} zone
 * @returns {{ x: number, y: number, w: number, h: number }|null}
 */
export function normalizeZone(zone) {
	const x = Number(zone?.x)
	const y = Number(zone?.y)
	const w = Number(zone?.w)
	const h = Number(zone?.h)
	if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) {
		return null
	}
	return { x, y, w, h }
}

/**
 * True when an object's XY footprint rectangle overlaps the zone (touching
 * edges do not count — a part flush against a keep-out boundary is legal).
 * @param {{ x: number, y: number, w: number, h: number }} zone
 * @param {{ minX: number, minY: number, maxX: number, maxY: number }} rect
 * @returns {boolean}
 */
export function zoneIntersectsRect(zone, rect) {
	const z = normalizeZone(zone)
	if (!z || !rect) {
		return false
	}
	return rect.minX < z.x + z.w
		&& rect.maxX > z.x
		&& rect.minY < z.y + z.h
		&& rect.maxY > z.y
}

/**
 * True when the rect overlaps ANY zone in the list.
 * @param {Array<object>} zones
 * @param {{ minX: number, minY: number, maxX: number, maxY: number }} rect
 * @returns {boolean}
 */
export function rectInAnyZone(zones, rect) {
	return (zones || []).some((z) => zoneIntersectsRect(z, rect))
}
