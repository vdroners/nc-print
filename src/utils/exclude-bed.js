/**
 * Top-down bed layout for Klipper exclude_object parts.
 *
 * Machine coordinates: origin at the front-left, X to the right, Y toward
 * the back. The SVG puts the front of the bed at the bottom — the view of
 * someone standing in front of the printer.
 *
 * Polygons are drawn when present. A center with no polygon becomes a
 * labeled marker. Parts with neither are returned unplaced so the name list
 * remains the way to tell them apart.
 */

const MARKERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
/** K1 Max and the common configured fallback when no bed size is passed. */
const DEFAULT_BED_MM = 300
const SIDE_PAD_MM = 8
const FRONT_PAD_MM = 28
const BACK_PAD_MM = 8
const SKIP_TOKENS = new Set(['STEP', 'ID', 'COPY', 'STL', 'OBJ', '3MF'])

/**
 * Stable A, B, C… badge shared by the bed and the list.
 * @param {number} index
 * @returns {string}
 */
export function objectMarker(index) {
	if (index >= 0 && index < MARKERS.length) {
		return MARKERS[index]
	}
	return String(index + 1)
}

/**
 * Tokens of an exclude-object name, with a trailing `COPY <n>` dropped.
 * @param {string} name
 * @returns {string[]}
 */
export function significantTokens(name) {
	const tokens = String(name ?? '')
		.split(/[^A-Za-z0-9]+/)
		.filter(Boolean)
	if (
		tokens.length >= 2
		&& /^copy$/i.test(tokens[tokens.length - 2])
		&& /^\d+$/.test(tokens[tokens.length - 1])
	) {
		tokens.splice(-2, 2)
	}
	return tokens
}

/**
 * @param {string[][]} lists
 * @returns {number}
 */
function commonPrefixLength(lists) {
	if (!lists.length) {
		return 0
	}
	const minLen = Math.min(...lists.map((list) => list.length))
	let i = 0
	for (; i < minLen; i++) {
		const token = lists[0][i].toLowerCase()
		if (!lists.every((list) => list[i].toLowerCase() === token)) {
			break
		}
	}
	return i
}

/**
 * Readable short label for a long gcode-derived object name.
 * Shared prefixes collapse so `…STEP_A_ID_0_COPY_0` / `…STEP_B_…` become A and B.
 * @param {string} name
 * @param {string[]} [peers] every name in the job, including this one
 * @returns {string}
 */
export function shortObjectLabel(name, peers = []) {
	const self = significantTokens(name)
	if (!self.length) {
		return ''
	}
	const others = (Array.isArray(peers) ? peers : [])
		.filter((peer) => peer !== name)
		.map(significantTokens)
	const start = others.length ? commonPrefixLength([self, ...others]) : 0
	let rest = self.slice(start)
	if (!rest.length) {
		rest = self.slice(-2)
	}
	const letter = rest.find((token) => /^[A-Za-z]$/.test(token))
	if (letter) {
		const peerLetters = others.map((tokens) => {
			const found = tokens.slice(start).find((token) => /^[A-Za-z]$/.test(token))
			return found ? found.toUpperCase() : ''
		})
		if (!peerLetters.includes(letter.toUpperCase())) {
			return letter.toUpperCase()
		}
	}
	const meaningful = rest.filter((token) => !SKIP_TOKENS.has(token.toUpperCase()))
	const chosen = (meaningful.length ? meaningful : rest).slice(0, 3)
	let label = chosen.join(' ')
	if (label.length > 16) {
		label = chosen[0].slice(0, 12)
	}
	return label
}

/**
 * @param {Array<{name?: string}>} objects
 * @returns {Array<{name: string, marker: string, shortLabel: string}>}
 */
export function assignObjectLabels(objects) {
	const list = Array.isArray(objects) ? objects : []
	const names = list.map((obj) => String(obj?.name ?? ''))
	const raw = names.map((name) => shortObjectLabel(name, names))
	const counts = new Map()
	for (const label of raw) {
		counts.set(label, (counts.get(label) || 0) + 1)
	}
	return list.map((obj, index) => {
		const marker = objectMarker(index)
		let shortLabel = raw[index]
		if (!shortLabel || (counts.get(shortLabel) || 0) > 1) {
			shortLabel = marker
		}
		return {
			...obj,
			name: names[index],
			marker,
			shortLabel,
		}
	})
}

/**
 * Glyph drawn inside the footprint. Short tokens (A, B, lid) fit; longer
 * labels stay on the list and the bed shows the letter badge.
 * @param {string} shortLabel
 * @param {string} marker
 * @returns {string}
 */
export function bedGlyph(shortLabel, marker) {
	const text = String(shortLabel || '').trim()
	if (text && text.length <= 4) {
		return text
	}
	return marker || ''
}

/**
 * @param {unknown} value
 * @returns {number|null}
 */
function finitePositive(value) {
	const n = Number(value)
	return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * @param {number} n
 * @returns {number}
 */
function round2(n) {
	return Math.round(n * 100) / 100
}

/**
 * @param {Array<[number, number]>} points
 * @returns {[number, number]}
 */
function centroid(points) {
	let x = 0
	let y = 0
	for (const [px, py] of points) {
		x += px
		y += py
	}
	return [x / points.length, y / points.length]
}

/**
 * @param {object} obj
 * @param {string|null} currentObject
 * @returns {'printing'|'excluded'|'waiting'}
 */
function objectStatus(obj, currentObject) {
	if (obj.excluded) {
		return 'excluded'
	}
	if (currentObject != null && obj.name === currentObject) {
		return 'printing'
	}
	return 'waiting'
}

/**
 * @param {object} obj
 * @returns {{polygon: Array<[number, number]>|null, center: [number, number]|null, bounds: Array<[number, number]>}}
 */
function geometryOf(obj) {
	const polygon = []
	if (Array.isArray(obj?.polygon)) {
		for (const point of obj.polygon) {
			if (!Array.isArray(point) || point.length < 2) {
				continue
			}
			const x = Number(point[0])
			const y = Number(point[1])
			if (Number.isFinite(x) && Number.isFinite(y)) {
				polygon.push([x, y])
			}
		}
	}
	const validPoly = polygon.length >= 3 ? polygon : null
	let center = null
	if (Array.isArray(obj?.center) && obj.center.length >= 2) {
		const x = Number(obj.center[0])
		const y = Number(obj.center[1])
		if (Number.isFinite(x) && Number.isFinite(y)) {
			center = [x, y]
		}
	}
	if (!center && validPoly) {
		center = centroid(validPoly)
	}
	const bounds = []
	if (validPoly) {
		bounds.push(...validPoly)
	}
	if (center) {
		bounds.push(center)
	}
	return { polygon: validPoly, center, bounds }
}

/**
 * @param {Array<[number, number]>|null} polygon
 * @param {number} markerR
 * @returns {number}
 */
function glyphSize(polygon, markerR) {
	if (!polygon) {
		return round2(Math.max(8, markerR * 0.95))
	}
	let minX = Infinity
	let minY = Infinity
	let maxX = -Infinity
	let maxY = -Infinity
	for (const [x, y] of polygon) {
		if (x < minX) minX = x
		if (y < minY) minY = y
		if (x > maxX) maxX = x
		if (y > maxY) maxY = y
	}
	const span = Math.min(maxX - minX, maxY - minY)
	return round2(Math.max(7, Math.min(16, span * 0.38)))
}

/**
 * Lay out exclude-objects on a top-down bed.
 * @param {Array<{name?: string, excluded?: boolean, center?: number[]|null, polygon?: Array<[number, number]>|null}>} objects
 * @param {{width?: number, depth?: number, currentObject?: string|null}} [options]
 */
export function layoutExcludeBed(objects, options = {}) {
	const bedWidth = finitePositive(options.width) || DEFAULT_BED_MM
	const bedDepth = finitePositive(options.depth) || DEFAULT_BED_MM
	const currentObject = options.currentObject != null && options.currentObject !== ''
		? String(options.currentObject)
		: null
	const labeled = assignObjectLabels(objects)
	const geometries = labeled.map(geometryOf)

	let minX = 0
	let minY = 0
	let maxX = bedWidth
	let maxY = bedDepth
	for (const geo of geometries) {
		for (const [x, y] of geo.bounds) {
			if (x < minX) minX = x
			if (y < minY) minY = y
			if (x > maxX) maxX = x
			if (y > maxY) maxY = y
		}
	}
	minX -= SIDE_PAD_MM
	maxX += SIDE_PAD_MM
	minY -= FRONT_PAD_MM
	maxY += BACK_PAD_MM

	const spanX = maxX - minX
	const spanY = maxY - minY
	const svgX = (x) => round2(x - minX)
	const svgY = (y) => round2(maxY - y)
	const markerR = round2(Math.max(8, Math.min(bedWidth, bedDepth) * 0.04))

	const items = labeled.map((obj, index) => {
		const geo = geometries[index]
		const status = objectStatus(obj, currentObject)
		const glyph = bedGlyph(obj.shortLabel, obj.marker)
		const base = {
			name: obj.name,
			marker: obj.marker,
			shortLabel: obj.shortLabel,
			glyph,
			excluded: !!obj.excluded,
			status,
			placed: false,
			points: null,
			cx: null,
			cy: null,
			r: markerR,
			fontSize: glyphSize(null, markerR),
		}
		if (!geo.center) {
			return base
		}
		return {
			...base,
			placed: true,
			points: geo.polygon
				? geo.polygon.map(([x, y]) => `${svgX(x)},${svgY(y)}`).join(' ')
				: null,
			cx: svgX(geo.center[0]),
			cy: svgY(geo.center[1]),
			fontSize: glyphSize(geo.polygon, markerR),
		}
	})

	const frontY = round2(svgY(0) + 16)
	return {
		bedWidth,
		bedDepth,
		viewBox: `0 0 ${round2(spanX)} ${round2(spanY)}`,
		plate: {
			x: svgX(0),
			y: svgY(bedDepth),
			width: round2(bedWidth),
			height: round2(bedDepth),
		},
		guides: {
			x: svgX(bedWidth / 2),
			y: svgY(bedDepth / 2),
			left: svgX(0),
			right: svgX(bedWidth),
			top: svgY(bedDepth),
			bottom: svgY(0),
		},
		front: { x: svgX(bedWidth / 2), y: frontY },
		leftLabel: { x: svgX(0), y: frontY },
		rightLabel: { x: svgX(bedWidth), y: frontY },
		items,
		placed: items.filter((item) => item.placed),
		unplaced: items.filter((item) => !item.placed).map((item) => item.name),
		ariaLabel: `Top-down print bed, ${bedWidth} by ${bedDepth} millimetres, front at the bottom`,
	}
}
