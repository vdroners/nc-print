/** Shared G-code layer + 2D toolpath parsing for preview components. */

export const MAX_BLOB_BYTES = 5 * 1024 * 1024
export const MAX_LINES_PER_LAYER = 400

/**
 * @param {string} line
 * @returns {{ x?: number, y?: number, e?: number, g?: number }}
 */
export function parseGcodeMotion(line) {
	const trimmed = (line || '').trim()
	if (!/^G[01]\b/i.test(trimmed)) {
		return {}
	}
	const g = trimmed.startsWith('G0') || trimmed.startsWith('g0') ? 0 : 1
	const out = { g }
	const re = /([XYZEF])(-?\d*\.?\d+(?:[eE][+-]?\d+)?)/gi
	let m
	while ((m = re.exec(trimmed)) !== null) {
		const axis = m[1].toUpperCase()
		const val = Number(m[2])
		if (Number.isNaN(val)) {
			continue
		}
		if (axis === 'X') {
			out.x = val
		} else if (axis === 'Y') {
			out.y = val
		} else if (axis === 'E') {
			out.e = val
		}
	}
	return out
}

/**
 * @param {string[]} lines
 * @returns {{ segments: Array<{ x0: number, y0: number, x1: number, y1: number, extruding: boolean }>, bounds: { minX: number, minY: number, maxX: number, maxY: number }|null }}
 */
export function linesToSegments(lines) {
	const segments = []
	let x = 0
	let y = 0
	let e = 0
	let minX = Infinity
	let minY = Infinity
	let maxX = -Infinity
	let maxY = -Infinity

	for (const line of lines) {
		const motion = parseGcodeMotion(line)
		if (motion.x === undefined && motion.y === undefined) {
			continue
		}
		const nx = motion.x ?? x
		const ny = motion.y ?? y
		const ne = motion.e ?? e
		const extruding = motion.g === 1 && (motion.e !== undefined ? ne > e : true)
		segments.push({ x0: x, y0: y, x1: nx, y1: ny, extruding })
		x = nx
		y = ny
		if (motion.e !== undefined) {
			e = ne
		}
		minX = Math.min(minX, x, nx)
		minY = Math.min(minY, y, ny)
		maxX = Math.max(maxX, x, nx)
		maxY = Math.max(maxY, y, ny)
	}

	const bounds = segments.length
		? { minX, minY, maxX, maxY }
		: null
	return { segments, bounds }
}

/**
 * @param {Blob|File|null} blob
 * @returns {Promise<{ layers: Array<{ lines: string[], segments: object[], bounds: object|null }>, layerCount: number, error: string }>}
 */
export async function parseGcodeLayers(blob) {
	const empty = { layers: [], layerCount: 0, error: '' }
	if (!blob) {
		return empty
	}
	if (blob.size > MAX_BLOB_BYTES) {
		const mb = (blob.size / (1024 * 1024)).toFixed(1)
		return {
			...empty,
			error: `G-code preview skipped — file is ${mb} MB (limit ${MAX_BLOB_BYTES / (1024 * 1024)} MB). Download to inspect full toolpaths.`,
		}
	}
	try {
		const text = await blob.text()
		const lines = text.split('\n')
		let current = []
		const found = []
		for (const line of lines) {
			if (line.startsWith(';LAYER:') || /^;LAYER\s+\d+/i.test(line)) {
				if (current.length) {
					found.push(current.slice(0, MAX_LINES_PER_LAYER))
				}
				current = [line]
			} else if (/^G[01]\b/i.test(line.trim())) {
				current.push(line)
			}
		}
		if (current.length) {
			found.push(current.slice(0, MAX_LINES_PER_LAYER))
		}
		const rawLayers = found.length
			? found
			: [lines.filter(l => /^G[01]\b/i.test(l.trim())).slice(0, MAX_LINES_PER_LAYER)]

		const layers = rawLayers.map((layerLines) => {
			const { segments, bounds } = linesToSegments(layerLines)
			return { lines: layerLines, segments, bounds }
		})
		return { layers, layerCount: layers.length, error: '' }
	} catch (e) {
		return { ...empty, error: e?.message || 'Could not parse G-code preview' }
	}
}
