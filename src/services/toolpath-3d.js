/**
 * 3D toolpath preview data client.
 *
 * Fetches the server-parsed toolpath for a slice job (feature-typed, layer-
 * indexed 3D segments) from the sidecar via the slicer proxy, and converts each
 * feature's flat position list into a Float32Array ready for a Three.js
 * LineSegments BufferGeometry. Parsing happens server-side so the browser never
 * touches multi-MB gcode.
 */
import { generateUrl } from '@nextcloud/router'

const apiBase = () => generateUrl('/apps/nc_print/api/slicer')

/**
 * Orca-like colours per feature type. Kept in sync with the sidecar's
 * FEATURE_TYPES list; unknown keys fall back to a neutral grey.
 * @type {Record<string, number>}
 */
export const FEATURE_COLORS = {
	outer_wall: 0xff5a3c,
	inner_wall: 0xffb02e,
	overhang_wall: 0xff2e88,
	sparse_infill: 0xd9a441,
	solid_infill: 0xc98a2b,
	top_surface: 0x4caf50,
	bottom_surface: 0x2e8b7a,
	bridge: 0x2ec5ff,
	support: 0x6fd3ff,
	support_iface: 0x9d7bff,
	skirt_brim: 0x9ca3af,
	prime_tower: 0xc084fc,
	ironing: 0x38bdf8,
	gap_infill: 0xa3e635,
	custom: 0x8b949e,
	other: 0x8b949e,
	travel: 0x556070,
}

/** Human labels for the legend (feature key → label). */
export const FEATURE_LABELS = {
	outer_wall: 'Outer wall',
	inner_wall: 'Inner wall',
	overhang_wall: 'Overhang',
	sparse_infill: 'Infill',
	solid_infill: 'Solid infill',
	top_surface: 'Top',
	bottom_surface: 'Bottom',
	bridge: 'Bridge',
	support: 'Support',
	support_iface: 'Support iface',
	skirt_brim: 'Skirt/brim',
	prime_tower: 'Prime tower',
	ironing: 'Ironing',
	gap_infill: 'Gap fill',
	custom: 'Custom',
	other: 'Other',
	travel: 'Travel',
}

/**
 * Fetch and normalise the toolpath for a job.
 * @param {string} jobId
 * @returns {Promise<{ layers: Array<{ z: number, height: number|null, features: Record<string, Float32Array> }>, bbox: object|null, featureTypes: string[], layerCount: number }>}
 */
export async function fetchToolpath(jobId) {
	const url = `${apiBase()}/jobs/${encodeURIComponent(jobId)}/toolpath`
	const res = await fetch(url, { credentials: 'same-origin' })
	if (!res.ok) {
		throw new Error(`Toolpath unavailable (${res.status})`)
	}
	const data = await res.json()
	const layers = (data.layers || []).map((layer) => {
		const features = {}
		const speeds = {}
		for (const [feat, seg] of Object.entries(layer.segments || {})) {
			const pos = seg?.positions
			if (Array.isArray(pos) && pos.length >= 6) {
				features[feat] = new Float32Array(pos)
				// One speed per segment (parallel array; may be absent on an
				// un-rebuilt sidecar → color-by-speed falls back to feature mode).
				if (Array.isArray(seg.speeds) && seg.speeds.length) {
					speeds[feat] = new Float32Array(seg.speeds)
				}
			}
		}
		return { z: layer.z, height: layer.height, features, speeds }
	})
	const meta = data.meta || {}
	return {
		layers,
		bbox: data.bbox || null,
		featureTypes: data.feature_types || Object.keys(FEATURE_COLORS),
		layerCount: meta.layer_count ?? layers.length,
		speedRange: (meta.speed_min != null && meta.speed_max != null)
			? { min: meta.speed_min, max: meta.speed_max }
			: null,
	}
}

/**
 * Map a speed (mm/s) to an RGB color across a blue→green→yellow→red ramp,
 * normalized to [min,max]. Used for the color-by-speed toolpath mode.
 * @param {number} v speed mm/s
 * @param {number} min
 * @param {number} max
 * @returns {[number, number, number]} rgb 0..1
 */
export function colorForSpeed(v, min, max) {
	const span = max - min
	let t = span > 0 ? (v - min) / span : 0.5
	t = Math.max(0, Math.min(1, t))
	// 4-stop ramp: blue(0) → cyan(.33) → yellow(.66) → red(1)
	const stops = [
		[0.13, 0.42, 0.99], // blue
		[0.18, 0.80, 0.78], // cyan/green
		[0.96, 0.83, 0.18], // yellow
		[0.90, 0.24, 0.20], // red
	]
	const scaled = t * (stops.length - 1)
	const i = Math.min(stops.length - 2, Math.floor(scaled))
	const f = scaled - i
	const a = stops[i]
	const b = stops[i + 1]
	return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]
}

/**
 * Feature keys present across all layers, in the sidecar's canonical order.
 * @param {object} toolpath Output of fetchToolpath
 * @returns {string[]}
 */
export function presentFeatures(toolpath) {
	const seen = new Set()
	for (const layer of toolpath.layers || []) {
		for (const feat of Object.keys(layer.features || {})) {
			seen.add(feat)
		}
	}
	return (toolpath.featureTypes || []).filter((f) => seen.has(f))
}
