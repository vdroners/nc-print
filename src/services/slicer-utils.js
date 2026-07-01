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
 * Parse a trailing SSE block that may lack the final blank-line delimiter
 * when the server closes the socket (common on proxied streams).
 *
 * @param {string} leftover
 * @returns {Array<{ event: string, parsed: object|null }>}
 */
export function flushSseLeftover(leftover = '') {
	const trimmed = (leftover || '').trimEnd()
	if (!trimmed) {
		return []
	}
	return parseSseChunk('\n\n', trimmed).events
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
	num('fan_speed', form.fanSpeed)
	num('retraction_length', form.retractionLength)
	num('retraction_speed', form.retractionSpeed)

	const bool = (key, val) => {
		if (val === '' || val === null || val === undefined) {
			return
		}
		overrides[key] = val === true || val === 'true' || val === 1 || val === '1'
	}
	bool('enable_support', form.enableSupport)
	num('support_threshold', form.supportThreshold)
	num('brim_width', form.brimWidth)
	num('raft_layers', form.raftLayers)
	num('skirt_loops', form.skirtLoops)
	if (form.supportType !== '' && form.supportType != null) {
		overrides.support_type = String(form.supportType)
	}

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
/** @type {Array<{ key: string, label: string, format?: (v: unknown) => string }>} */
export const OVERRIDE_FIELD_DEFS = [
	{ key: 'layerHeight', label: 'Layer height (mm)' },
	{ key: 'lineWidth', label: 'Line width (mm)' },
	{ key: 'perimeters', label: 'Perimeters' },
	{ key: 'infillDensity', label: 'Infill density (%)' },
	{ key: 'printSpeed', label: 'Print speed (mm/s)' },
	{ key: 'firstLayerSpeed', label: 'First layer speed (mm/s)' },
	{ key: 'nozzleTemp', label: 'Nozzle temp (°C)' },
	{ key: 'bedTemp', label: 'Bed temp (°C)' },
	{ key: 'fanSpeed', label: 'Fan speed (%)' },
	{ key: 'retractionLength', label: 'Retraction (mm)' },
	{ key: 'retractionSpeed', label: 'Retraction speed (mm/s)' },
	{ key: 'enableSupport', label: 'Supports', format: v => (v ? 'On' : 'Off') },
	{ key: 'supportType', label: 'Support type' },
	{ key: 'supportThreshold', label: 'Support threshold (°)' },
	{ key: 'brimWidth', label: 'Brim width (mm)' },
	{ key: 'raftLayers', label: 'Raft layers' },
	{ key: 'skirtLoops', label: 'Skirt loops' },
]

/**
 * Rows where operator overrides differ from merged profile defaults.
 * @param {object} form Current override form from store
 * @param {object} mergedDefaults Output of mergeProfileSettings
 * @returns {Array<{ key: string, label: string, defaultValue: string|number, overrideValue: string|number }>}
 */
function formatOverrideValue(value, format) {
	if (value === '' || value == null) {
		return ''
	}
	if (format) {
		return format(value)
	}
	return String(value)
}

export function diffOverrides(form = {}, mergedDefaults = {}) {
	const defaults = mergedToOverrideForm(mergedDefaults)
	const rows = []
	for (const { key, label, format } of OVERRIDE_FIELD_DEFS) {
		const overrideValue = form[key]
		const defaultValue = defaults[key]
		const o = formatOverrideValue(overrideValue, format)
		const d = formatOverrideValue(defaultValue, format)
		if (o !== '' && o !== d) {
			rows.push({
				key,
				label,
				defaultValue: d || defaultValue,
				overrideValue: o || overrideValue,
			})
		}
	}
	return rows
}

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
		fanSpeed: merged.fanSpeed ?? merged.fan_speed ?? '',
		retractionLength: merged.retractionLength ?? merged.retraction_length ?? '',
		retractionSpeed: merged.retractionSpeed ?? merged.retraction_speed ?? '',
		enableSupport: !!(merged.enableSupport ?? merged.enable_support),
		supportType: merged.supportType ?? merged.support_type ?? '',
		supportThreshold: merged.supportThreshold ?? merged.support_threshold ?? '',
		brimWidth: merged.brimWidth ?? merged.brim_width ?? '',
		raftLayers: merged.raftLayers ?? merged.raft_layers ?? '',
		skirtLoops: merged.skirtLoops ?? merged.skirt_loops ?? '',
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
 * Resolve filament price per kg from profile settings or app config.
 * @param {object|null|undefined} config App config from fetchConfig
 * @param {object} [filamentSettings] Merged or filament profile settings_json
 * @returns {number|null}
 */
export function resolveFilamentPricePerKg(config, filamentSettings = {}) {
	const profileKeys = [
		filamentSettings.filament_price,
		filamentSettings.filamentPrice,
		filamentSettings.price_per_kg,
		filamentSettings.pricePerKg,
	]
	for (const raw of profileKeys) {
		const n = Number(raw)
		if (Number.isFinite(n) && n > 0) {
			return n
		}
	}
	const fromConfig = Number(config?.default_filament_price_kg)
	if (Number.isFinite(fromConfig) && fromConfig > 0) {
		return fromConfig
	}
	return null
}

/**
 * Estimate material cost from grams used and price per kg.
 * @param {number} grams
 * @param {number|null|undefined} pricePerKg
 * @returns {number|null}
 */
export function estimateFilamentCost(grams, pricePerKg) {
	const g = Number(grams)
	const price = Number(pricePerKg)
	if (!Number.isFinite(g) || g <= 0 || !Number.isFinite(price) || price <= 0) {
		return null
	}
	return (g / 1000) * price
}

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
 * @param {ArrayBuffer} buf
 * @returns {boolean}
 */
function isAsciiStl(buf) {
	if (!buf || buf.byteLength < 5) {
		return false
	}
	const head = new TextDecoder('ascii').decode(buf.slice(0, 5)).toLowerCase()
	return head === 'solid'
}

/**
 * Minimal ASCII STL parse — vertex lines only (no binary mis-read).
 * @param {ArrayBuffer} buf
 * @returns {{ triangleCount: number, bbox: { x: number, y: number, z: number }|null, note?: string }}
 */
function parseAsciiStlMetadata(buf) {
	const text = new TextDecoder('utf-8', { fatal: false }).decode(buf)
	if (!/^\s*solid\b/i.test(text)) {
		return { triangleCount: 0, bbox: null, note: 'not ASCII STL' }
	}
	const vertexRe = /^\s*vertex\s+([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s+([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s+([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*$/gim
	let minX = Infinity
	let minY = Infinity
	let minZ = Infinity
	let maxX = -Infinity
	let maxY = -Infinity
	let maxZ = -Infinity
	let vertexCount = 0
	let match
	while ((match = vertexRe.exec(text)) !== null) {
		const x = Number(match[1])
		const y = Number(match[2])
		const z = Number(match[3])
		if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z)) {
			continue
		}
		vertexCount++
		minX = Math.min(minX, x)
		maxX = Math.max(maxX, x)
		minY = Math.min(minY, y)
		maxY = Math.max(maxY, y)
		minZ = Math.min(minZ, z)
		maxZ = Math.max(maxZ, z)
	}
	if (vertexCount < 3) {
		return { triangleCount: 0, bbox: null, note: 'ASCII STL: no vertices parsed' }
	}
	return {
		triangleCount: Math.floor(vertexCount / 3),
		bbox: {
			x: maxX - minX,
			y: maxY - minY,
			z: maxZ - minZ,
		},
		note: 'ASCII STL',
	}
}

/**
 * Parse binary STL header for triangle count / rough bbox (client-side).
 * @param {ArrayBuffer} buf
 * @returns {{ triangleCount: number, bbox: { x: number, y: number, z: number }|null, note?: string }}
 */
export function parseStlMetadata(buf) {
	if (!buf || buf.byteLength < 5) {
		return { triangleCount: 0, bbox: null }
	}
	if (isAsciiStl(buf)) {
		return parseAsciiStlMetadata(buf)
	}
	if (buf.byteLength < 84) {
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

/** Human-readable labels for forge-slicer SSE progress stages. */
export const SLICE_STAGE_LABELS = {
	preparing: 'Preparing model',
	prepare: 'Preparing model',
	load: 'Loading model',
	slice: 'Slicing layers',
	slicing: 'Slicing layers',
	generate: 'Generating toolpaths',
	export: 'Exporting G-code',
	exporting: 'Exporting G-code',
	done: 'Complete',
	complete: 'Complete',
	cancelled: 'Cancelled',
	error: 'Failed',
}

/**
 * @param {string} stage raw stage from SSE
 * @returns {string}
 */
export function mapSliceStageLabel(stage) {
	if (!stage) {
		return 'Slicing'
	}
	const key = String(stage).toLowerCase().replace(/\s+/g, '_')
	if (SLICE_STAGE_LABELS[key]) {
		return SLICE_STAGE_LABELS[key]
	}
	return String(stage).replace(/_/g, ' ')
}

/**
 * @param {object} profiles pinia profiles state
 * @param {string} printerId
 * @returns {number}
 */
export function parseExtruderCount(profiles, printerId) {
	const p = (profiles?.printers || []).find(x => String(x.id) === String(printerId))
	if (!p?.settings_json) {
		return 1
	}
	const s = parseProfileSettings(p.settings_json)
	const n = Number(s.extruder_count ?? s.extruderCount ?? s.nozzle_diameter?.length ?? 1)
	return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1
}

/**
 * @param {object} profiles
 * @param {object} selection
 * @returns {string[]}
 */
export function resolveFilamentIds(selection, extruderCount = 1) {
	if (Array.isArray(selection.filamentIds) && selection.filamentIds.length) {
		const ids = selection.filamentIds.filter(Boolean)
		while (ids.length < extruderCount) {
			ids.push(selection.filamentId || ids[0] || '')
		}
		return ids.slice(0, extruderCount)
	}
	if (selection.filamentId) {
		return Array.from({ length: extruderCount }, () => selection.filamentId)
	}
	return []
}
