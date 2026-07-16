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

	// Surface-quality / detail overrides (process-scoped in the engine).
	bool('adaptive_layer_height', form.adaptiveLayerHeight)
	const str = (key, val) => {
		if (val !== '' && val != null) {
			overrides[key] = String(val)
		}
	}
	str('ironing_type', form.ironingType)
	str('fuzzy_skin', form.fuzzySkin)
	str('seam_position', form.seamPosition)

	// Infill / surface patterns + per-feature speeds + support interface tuning
	// + first-layer height (all process-scoped engine keys).
	num('first_layer_height', form.firstLayerHeight)
	str('infill_pattern', form.infillPattern)
	str('top_surface_pattern', form.topSurfacePattern)
	str('bottom_surface_pattern', form.bottomSurfacePattern)
	num('infill_speed', form.infillSpeed)
	num('solid_infill_speed', form.solidInfillSpeed)
	num('support_top_gap', form.supportTopGap)
	num('support_interface_layers', form.supportInterfaceLayers)
	num('support_interface_spacing', form.supportInterfaceSpacing)

	// Wipe / prime tower (multi-material purge). enable is a bool; the rest are
	// numeric; extra-spacing is a percentage handled server-side as "NN%".
	bool('enable_prime_tower', form.enablePrimeTower)
	num('prime_tower_width', form.primeTowerWidth)
	num('prime_tower_brim_width', form.primeTowerBrimWidth)
	num('prime_volume', form.primeVolume)
	num('wipe_tower_rotation', form.wipeTowerRotation)
	num('wipe_tower_extra_spacing', form.wipeTowerExtraSpacing)

	// Quality tier. overhang_speed_N + shell layer counts + bridge + elephant
	// foot + infill-wall overlap (overlap sent as a plain number; server writes
	// "NN%"). bridge_flow is a ratio (~0.95), not a percent.
	num('overhang_speed_1', form.overhangSpeed1)
	num('overhang_speed_2', form.overhangSpeed2)
	num('overhang_speed_3', form.overhangSpeed3)
	num('overhang_speed_4', form.overhangSpeed4)
	num('top_shell_layers', form.topShellLayers)
	num('bottom_shell_layers', form.bottomShellLayers)
	num('bridge_speed', form.bridgeSpeed)
	num('bridge_flow', form.bridgeFlow)
	bool('bridge_no_support', form.bridgeNoSupport)
	num('elephant_foot', form.elephantFoot)
	num('infill_wall_overlap', form.infillWallOverlap)

	// Ironing + support detail tier.
	num('ironing_flow', form.ironingFlow)
	num('ironing_spacing', form.ironingSpacing)
	num('ironing_speed', form.ironingSpeed)
	num('support_interface_bottom_layers', form.supportInterfaceBottomLayers)
	str('support_base_pattern', form.supportBasePattern)
	num('tree_support_branch_angle', form.treeSupportBranchAngle)
	str('draft_shield', form.draftShield)
	str('bed_type', form.bedType)

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
// `engineKey` = the OrcaSlicer-fork resolved-settings key this override maps to
// (source of truth: slicer/adapter/overrides.py _MAP). `type` drives how the
// profile-baseline value is normalized for display/diff: 'num' | 'pct' (0-1→%) |
// 'bool' | 'str'. Used by mergedToOverrideFormFull() so modified-highlight +
// reset-to-default cover ALL fields, not just the basic handful.
// Each entry also carries `level` (basic | advanced | expert) and `group` for the
// Simple/Advanced/Expert settings tree (v1.65). `level` is additive & cumulative:
// Simple shows basic; Advanced shows basic+advanced; Expert shows everything.
// `group` clusters fields under a section header. These are PURE metadata — they
// don't touch the diff/reset logic (isOverrideModified/mergedToOverrideFormFull).
export const OVERRIDE_FIELD_DEFS = [
	{ key: 'layerHeight', label: 'Layer height (mm)', engineKey: 'layer_height', type: 'num', level: 'basic', group: 'Quality' },
	{ key: 'firstLayerHeight', label: 'First layer height (mm)', engineKey: 'initial_layer_print_height', type: 'num', level: 'basic', group: 'Quality' },
	{ key: 'lineWidth', label: 'Line width (mm)', engineKey: 'line_width', type: 'num', level: 'advanced', group: 'Quality' },
	{ key: 'adaptiveLayerHeight', label: 'Adaptive layers', engineKey: 'adaptive_layer_height', type: 'bool', format: v => (v ? 'On' : 'Off'), level: 'expert', group: 'Quality' },
	{ key: 'elephantFoot', label: 'Elephant foot compensation (mm)', engineKey: 'elefant_foot_compensation', type: 'num', level: 'expert', group: 'Quality' },

	{ key: 'perimeters', label: 'Perimeters', engineKey: 'wall_loops', type: 'num', level: 'basic', group: 'Walls & shells' },
	{ key: 'topShellLayers', label: 'Top shell layers', engineKey: 'top_shell_layers', type: 'num', level: 'advanced', group: 'Walls & shells' },
	{ key: 'bottomShellLayers', label: 'Bottom shell layers', engineKey: 'bottom_shell_layers', type: 'num', level: 'advanced', group: 'Walls & shells' },
	{ key: 'seamPosition', label: 'Seam position', engineKey: 'seam_position', type: 'str', level: 'advanced', group: 'Walls & shells' },
	{ key: 'fuzzySkin', label: 'Fuzzy skin', engineKey: 'fuzzy_skin', type: 'str', level: 'expert', group: 'Walls & shells' },

	{ key: 'infillDensity', label: 'Infill density (%)', engineKey: 'sparse_infill_density', type: 'pct', level: 'basic', group: 'Infill' },
	{ key: 'infillPattern', label: 'Infill pattern', engineKey: 'sparse_infill_pattern', type: 'str', level: 'basic', group: 'Infill' },
	{ key: 'topSurfacePattern', label: 'Top surface pattern', engineKey: 'top_surface_pattern', type: 'str', level: 'advanced', group: 'Infill' },
	{ key: 'bottomSurfacePattern', label: 'Bottom surface pattern', engineKey: 'bottom_surface_pattern', type: 'str', level: 'advanced', group: 'Infill' },
	{ key: 'infillWallOverlap', label: 'Infill/wall overlap (%)', engineKey: 'infill_wall_overlap', type: 'pct', level: 'expert', group: 'Infill' },

	{ key: 'printSpeed', label: 'Print speed (mm/s)', engineKey: 'outer_wall_speed', type: 'num', level: 'basic', group: 'Speed' },
	{ key: 'firstLayerSpeed', label: 'First layer speed (mm/s)', engineKey: 'initial_layer_speed', type: 'num', level: 'basic', group: 'Speed' },
	{ key: 'infillSpeed', label: 'Infill speed (mm/s)', engineKey: 'sparse_infill_speed', type: 'num', level: 'advanced', group: 'Speed' },
	{ key: 'solidInfillSpeed', label: 'Solid infill speed (mm/s)', engineKey: 'internal_solid_infill_speed', type: 'num', level: 'advanced', group: 'Speed' },
	{ key: 'bridgeSpeed', label: 'Bridge speed (mm/s)', engineKey: 'bridge_speed', type: 'num', level: 'advanced', group: 'Speed' },
	{ key: 'overhangSpeed1', label: 'Overhang speed 0–25% (mm/s)', engineKey: 'overhang_1_4_speed', type: 'num', level: 'expert', group: 'Speed' },
	{ key: 'overhangSpeed2', label: 'Overhang speed 25–50% (mm/s)', engineKey: 'overhang_2_4_speed', type: 'num', level: 'expert', group: 'Speed' },
	{ key: 'overhangSpeed3', label: 'Overhang speed 50–75% (mm/s)', engineKey: 'overhang_3_4_speed', type: 'num', level: 'expert', group: 'Speed' },
	{ key: 'overhangSpeed4', label: 'Overhang speed 75–100% (mm/s)', engineKey: 'overhang_4_4_speed', type: 'num', level: 'expert', group: 'Speed' },

	{ key: 'nozzleTemp', label: 'Nozzle temp (°C)', engineKey: 'nozzle_temperature', type: 'num', level: 'basic', group: 'Temperature' },
	{ key: 'bedTemp', label: 'Bed temp (°C)', engineKey: 'hot_plate_temp', type: 'num', level: 'basic', group: 'Temperature' },

	{ key: 'fanSpeed', label: 'Fan speed (%)', engineKey: 'fan_max_speed', type: 'num', level: 'basic', group: 'Cooling' },

	{ key: 'retractionLength', label: 'Retraction (mm)', engineKey: 'retraction_length', type: 'num', level: 'basic', group: 'Retraction' },
	{ key: 'retractionSpeed', label: 'Retraction speed (mm/s)', engineKey: 'retraction_speed', type: 'num', level: 'advanced', group: 'Retraction' },

	{ key: 'enableSupport', label: 'Supports', engineKey: 'enable_support', type: 'bool', format: v => (v ? 'On' : 'Off'), level: 'basic', group: 'Support' },
	{ key: 'supportType', label: 'Support type', engineKey: 'support_type', type: 'str', level: 'basic', group: 'Support' },
	{ key: 'supportThreshold', label: 'Support threshold (°)', engineKey: 'support_threshold_angle', type: 'num', level: 'advanced', group: 'Support' },
	{ key: 'supportTopGap', label: 'Support top gap (mm)', engineKey: 'support_top_z_distance', type: 'num', level: 'advanced', group: 'Support' },
	{ key: 'supportInterfaceLayers', label: 'Support interface layers', engineKey: 'support_interface_top_layers', type: 'num', level: 'advanced', group: 'Support' },
	{ key: 'supportInterfaceBottomLayers', label: 'Support interface bottom layers', engineKey: 'support_interface_bottom_layers', type: 'num', level: 'expert', group: 'Support' },
	{ key: 'supportInterfaceSpacing', label: 'Support interface spacing (mm)', engineKey: 'support_interface_spacing', type: 'num', level: 'advanced', group: 'Support' },
	{ key: 'supportBasePattern', label: 'Support base pattern', engineKey: 'support_base_pattern', type: 'str', level: 'expert', group: 'Support' },
	{ key: 'treeSupportBranchAngle', label: 'Tree support branch angle (°)', engineKey: 'tree_support_branch_angle', type: 'num', level: 'expert', group: 'Support' },
	{ key: 'bridgeFlow', label: 'Bridge flow (ratio)', engineKey: 'bridge_flow', type: 'num', level: 'expert', group: 'Support' },
	{ key: 'bridgeNoSupport', label: 'Bridges without support', engineKey: 'bridge_no_support', type: 'bool', format: v => (v ? 'On' : 'Off'), level: 'expert', group: 'Support' },

	{ key: 'bedType', label: 'Build plate', engineKey: 'curr_bed_type', type: 'str', level: 'basic', group: 'Adhesion' },
	{ key: 'brimWidth', label: 'Brim width (mm)', engineKey: 'brim_width', type: 'num', level: 'basic', group: 'Adhesion' },
	{ key: 'skirtLoops', label: 'Skirt loops', engineKey: 'skirt_loops', type: 'num', level: 'advanced', group: 'Adhesion' },
	{ key: 'raftLayers', label: 'Raft layers', engineKey: 'raft_layers', type: 'num', level: 'advanced', group: 'Adhesion' },
	{ key: 'draftShield', label: 'Draft shield', engineKey: 'draft_shield', type: 'str', level: 'expert', group: 'Adhesion' },

	{ key: 'ironingType', label: 'Ironing', engineKey: 'ironing_type', type: 'str', level: 'advanced', group: 'Ironing' },
	{ key: 'ironingFlow', label: 'Ironing flow (%)', engineKey: 'ironing_flow', type: 'pct', level: 'expert', group: 'Ironing' },
	{ key: 'ironingSpacing', label: 'Ironing spacing (mm)', engineKey: 'ironing_spacing', type: 'num', level: 'expert', group: 'Ironing' },
	{ key: 'ironingSpeed', label: 'Ironing speed (mm/s)', engineKey: 'ironing_speed', type: 'num', level: 'expert', group: 'Ironing' },

	{ key: 'enablePrimeTower', label: 'Prime tower', engineKey: 'enable_prime_tower', type: 'bool', format: v => (v ? 'On' : 'Off'), level: 'expert', group: 'Prime tower' },
	{ key: 'primeTowerWidth', label: 'Prime tower width (mm)', engineKey: 'prime_tower_width', type: 'num', level: 'expert', group: 'Prime tower' },
	{ key: 'primeTowerBrimWidth', label: 'Prime tower brim (mm)', engineKey: 'prime_tower_brim_width', type: 'num', level: 'expert', group: 'Prime tower' },
	{ key: 'primeVolume', label: 'Prime volume (mm³)', engineKey: 'prime_volume', type: 'num', level: 'expert', group: 'Prime tower' },
	{ key: 'wipeTowerRotation', label: 'Prime tower rotation (°)', engineKey: 'wipe_tower_rotation_angle', type: 'num', level: 'expert', group: 'Prime tower' },
	{ key: 'wipeTowerExtraSpacing', label: 'Prime tower extra spacing (%)', engineKey: 'wipe_tower_extra_spacing', type: 'pct', level: 'expert', group: 'Prime tower' },
]

/**
 * Strip empty / inherit values from an override map so only genuine per-object
 * overrides are sent. Empty string / null / undefined = "inherit the global
 * setting"; an unchecked support checkbox (false) also means inherit. Works on
 * frontend override keys (layerHeight, enableSupport, …) — the shape the store's
 * per-object `overrides` and the global `overrides` both use. Shared by the
 * per-object slice path + ArrangePlate.
 * @param {object} ov
 * @returns {object}
 */
export function cleanOverrides(ov) {
	const out = {}
	for (const [k, v] of Object.entries(ov || {})) {
		if (v === '' || v === null || v === undefined) {
			continue
		}
		if (k === 'enableSupport' && v === false) {
			continue // unchecked = inherit global
		}
		out[k] = v
	}
	return out
}

// Cumulative visibility: Simple ⊂ Advanced ⊂ Expert.
export const SETTINGS_LEVELS = ['basic', 'advanced', 'expert']

/** Whether a field's level is visible in the given mode (cumulative). */
export function levelVisible(fieldLevel, mode) {
	const fi = SETTINGS_LEVELS.indexOf(fieldLevel || 'basic')
	const mi = SETTINGS_LEVELS.indexOf(mode || 'basic')
	return fi <= (mi < 0 ? 0 : mi)
}

/** Case-insensitive label/key search match (empty query matches everything). */
export function matchesSearch(def, query) {
	const q = String(query || '').trim().toLowerCase()
	if (!q) {
		return true
	}
	return String(def.label || '').toLowerCase().includes(q)
		|| String(def.key || '').toLowerCase().includes(q)
		|| String(def.group || '').toLowerCase().includes(q)
}

/**
 * Group the override defs for a given mode + search query into ordered sections.
 * Returns [{ group, fields: [def, ...] }] preserving first-seen group order and
 * intra-group def order. A group with no visible fields is dropped.
 * @param {string} mode basic | advanced | expert
 * @param {string} query search text
 * @returns {Array<{ group: string, fields: object[] }>}
 */
export function groupsForMode(mode, query = '') {
	const order = []
	const byGroup = new Map()
	for (const def of OVERRIDE_FIELD_DEFS) {
		if (!levelVisible(def.level, mode) || !matchesSearch(def, query)) {
			continue
		}
		const g = def.group || 'Other'
		if (!byGroup.has(g)) {
			byGroup.set(g, [])
			order.push(g)
		}
		byGroup.get(g).push(def)
	}
	return order.map((g) => ({ group: g, fields: byGroup.get(g) }))
}

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
		bedType: merged.bedType ?? merged.curr_bed_type ?? merged.default_bed_type ?? '',
	}
}

/**
 * Full-coverage profile-baseline for EVERY override field (not just the ~19 in
 * mergedToOverrideForm). Reads each field's `engineKey` from the merged resolved
 * settings and normalizes by `type`. Used for modified-value highlight +
 * reset-to-default across the whole advanced panel. Kept separate from
 * mergedToOverrideForm so the existing (tested) basic mapping is untouched.
 * @param {object} merged output of mergeProfileSettings (engine-key settings)
 * @returns {Record<string, string|number|boolean>}
 */
export function mergedToOverrideFormFull(merged = {}) {
	const out = {}
	for (const { key, engineKey, type } of OVERRIDE_FIELD_DEFS) {
		if (!engineKey) {
			out[key] = ''
			continue
		}
		const raw = merged[engineKey]
		if (raw === undefined || raw === null || raw === '') {
			out[key] = type === 'bool' ? false : ''
			continue
		}
		if (type === 'bool') {
			out[key] = raw === true || raw === 1 || raw === '1' || raw === 'true'
		} else if (type === 'pct') {
			const n = Number(raw)
			out[key] = Number.isNaN(n) ? '' : (n <= 1 ? Math.round(n * 100) : Math.round(n))
		} else if (type === 'num') {
			const n = Number(raw)
			out[key] = Number.isNaN(n) ? '' : n
		} else {
			out[key] = String(raw)
		}
	}
	return out
}

/**
 * Is a single override field currently modified vs the profile baseline?
 * @param {string} key override field key
 * @param {object} form current override form (store `overrides`)
 * @param {object} baseline output of mergedToOverrideFormFull
 * @returns {boolean}
 */
export function isOverrideModified(key, form = {}, baseline = {}) {
	const def = OVERRIDE_FIELD_DEFS.find((d) => d.key === key)
	const v = form[key]
	// An empty/unset field means "use profile default" → never modified.
	if (v === '' || v === null || v === undefined) {
		return false
	}
	const o = formatOverrideValue(v, def?.format)
	const d = formatOverrideValue(baseline[key], def?.format)
	return o !== '' && o !== d
}

/** Quality tiers → layer-height (mm), the way Cura/Orca lead with a quality pick. */
export const QUALITY_TIERS = Object.freeze([
	{ id: 'draft', label: 'Draft', layerHeight: 0.28 },
	{ id: 'standard', label: 'Standard', layerHeight: 0.2 },
	{ id: 'fine', label: 'Fine', layerHeight: 0.12 },
])

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
