/**
 * Pure helpers — safe for unit tests (no Nextcloud deps).
 */

/**
 * @param {string} block
 * @returns {{ event: string, data: string }}
 */
export function parseSseBlock(block) {
	let event = 'message'
	let data = ''
	for (const line of block.split('\n')) {
		if (line.startsWith('event:')) {
			event = line.slice(6).trim()
		} else if (line.startsWith('data:')) {
			data += (data ? '\n' : '') + line.slice(5).trim()
		}
	}
	return { event, data }
}

/**
 * @param {string} chunk
 * @param {string} [leftover]
 * @returns {{ leftover: string, events: Array<{ event: string, parsed: object|null }> }}
 */
export function parseSseChunk(chunk, leftover = '') {
	let buffer = leftover + chunk
	const events = []
	let sep
	while ((sep = buffer.indexOf('\n\n')) >= 0) {
		const block = buffer.slice(0, sep)
		buffer = buffer.slice(sep + 2)
		const { event, data } = parseSseBlock(block)
		let parsed = null
		if (data) {
			try {
				parsed = JSON.parse(data)
			} catch {
				parsed = null
			}
		}
		events.push({ event, parsed })
	}
	return { leftover: buffer, events }
}

/**
 * @param {object} form
 * @returns {object}
 */
export function buildSliceOverrides(form = {}) {
	const overrides = {}
	const num = (key, val) => {
		if (val === '' || val === null || val === undefined) {
			return
		}
		const n = Number(val)
		if (!Number.isNaN(n)) {
			overrides[key] = n
		}
	}

	num('layer_height', form.layerHeight)
	num('line_width', form.lineWidth)
	num('perimeters', form.perimeters)
	if (form.infillDensity !== '' && form.infillDensity != null) {
		const pct = Number(form.infillDensity)
		if (!Number.isNaN(pct)) {
			overrides.infill_density = pct > 1 ? pct / 100 : pct
		}
	}
	num('print_speed', form.printSpeed)
	num('first_layer_speed', form.firstLayerSpeed)
	num('nozzle_temperature', form.nozzleTemp)
	num('bed_temperature', form.bedTemp)

	return overrides
}

/**
 * @param {string|object} settingsJson
 * @returns {object}
 */
export function parseProfileSettings(settingsJson) {
	if (!settingsJson) {
		return {}
	}
	if (typeof settingsJson === 'object') {
		return settingsJson
	}
	try {
		return JSON.parse(settingsJson)
	} catch {
		return {}
	}
}

/**
 * Merge printer + filament + process settings_json objects.
 * @param {object} profiles
 * @param {object} selection
 */
export function mergeProfileSettings(profiles, selection) {
	const out = {}
	const all = [
		...(profiles.printers || []),
		...(profiles.filaments || []),
		...(profiles.processes || []),
	]
	for (const id of [selection.printerId, selection.filamentId, selection.processId]) {
		if (!id) {
			continue
		}
		const row = all.find(p => String(p.id) === String(id))
		if (row?.settings_json) {
			Object.assign(out, parseProfileSettings(row.settings_json))
		}
	}
	return out
}

/**
 * Map merged Orca/forge profile keys to override form fields.
 * @param {object} merged
 */
export function mergedToOverrideForm(merged = {}) {
	const inf = merged.infillDensity ?? merged.infill_density
	let infillDensity = ''
	if (inf !== undefined && inf !== null) {
		const n = Number(inf)
		if (!Number.isNaN(n)) {
			infillDensity = n <= 1 ? Math.round(n * 100) : Math.round(n)
		}
	}
	return {
		layerHeight: merged.layerHeight ?? merged.layer_height ?? '',
		lineWidth: merged.lineWidth ?? merged.line_width ?? '',
		perimeters: merged.perimeters ?? merged.wall_loops ?? '',
		infillDensity,
		printSpeed: merged.printSpeed ?? merged.print_speed ?? '',
		firstLayerSpeed: merged.firstLayerSpeed ?? merged.first_layer_speed ?? '',
		nozzleTemp: merged.nozzleTemp ?? merged.nozzle_temperature ?? '',
		bedTemp: merged.bedTemp ?? merged.bed_temperature ?? '',
	}
}

/**
 * @param {object} profiles
 * @param {'printer'|'filament'|'process'} kind
 */
export function pickDefaultProfileId(profiles, kind) {
	const list = profiles[kind === 'printer' ? 'printers' : kind === 'filament' ? 'filaments' : 'processes'] || []
	const def = list.find(p => p.is_default)
	return def?.id ?? list[0]?.id ?? ''
}

/**
 * @param {number} seconds
 */
export function formatPrintTime(seconds) {
	const s = Math.max(0, Math.round(Number(seconds) || 0))
	const hours = Math.floor(s / 3600)
	const mins = Math.floor((s % 3600) / 60)
	if (hours > 0) {
		return `${hours}h ${mins}m`
	}
	return `${mins} min`
}

/**
 * @param {number[]} buildVolume [x,y,z] mm
 * @param {{ x: number, y: number, z: number }} bbox
 */
export function modelFitsBed(buildVolume, bbox) {
	if (!buildVolume || buildVolume.length !== 3 || !bbox) {
		return true
	}
	const [bx, by] = buildVolume
	return bbox.x <= bx && bbox.y <= by
}

/**
 * Estimate print time band from bbox + layer height (informational only).
 * @returns {string|null}
 */
export function estimatePrintTimeBand(bbox, layerHeightMm) {
	if (!bbox?.x || !bbox?.y || !bbox?.z) {
		return null
	}
	const lh = Number(layerHeightMm) || 0.2
	const layers = Math.ceil(bbox.z / lh)
	const minsLow = Math.max(5, Math.round(layers * 0.08))
	const minsHigh = Math.round(minsLow * 1.35)
	return `~${minsLow}–${minsHigh} min (estimate)`
}

/**
 * Parse binary STL header for triangle count / rough bbox (client-side).
 * @param {ArrayBuffer} buf
 * @returns {{ triangleCount: number, bbox: { x: number, y: number, z: number }|null }}
 */
export function parseStlMetadata(buf) {
	if (!buf || buf.byteLength < 84) {
		return { triangleCount: 0, bbox: null }
	}
	const dv = new DataView(buf)
	const triCount = dv.getUint32(80, true)
	const expected = 84 + triCount * 50
	if (expected !== buf.byteLength || triCount <= 0) {
		return { triangleCount: 0, bbox: null }
	}
	let minX = Infinity
	let minY = Infinity
	let minZ = Infinity
	let maxX = -Infinity
	let maxY = -Infinity
	let maxZ = -Infinity
	let off = 84
	for (let i = 0; i < triCount; i++) {
		off += 12
		for (let v = 0; v < 3; v++) {
			const x = dv.getFloat32(off, true)
			off += 4
			const y = dv.getFloat32(off, true)
			off += 4
			const z = dv.getFloat32(off, true)
			off += 4
			minX = Math.min(minX, x)
			maxX = Math.max(maxX, x)
			minY = Math.min(minY, y)
			maxY = Math.max(maxY, y)
			minZ = Math.min(minZ, z)
			maxZ = Math.max(maxZ, z)
		}
		off += 2
	}
	return {
		triangleCount: triCount,
		bbox: {
			x: maxX - minX,
			y: maxY - minY,
			z: maxZ - minZ,
		},
	}
}
