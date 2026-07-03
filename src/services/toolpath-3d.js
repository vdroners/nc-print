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
		for (const [feat, seg] of Object.entries(layer.segments || {})) {
			const pos = seg?.positions
			if (Array.isArray(pos) && pos.length >= 6) {
				features[feat] = new Float32Array(pos)
			}
		}
		return { z: layer.z, height: layer.height, features }
	})
	return {
		layers,
		bbox: data.bbox || null,
		featureTypes: data.feature_types || Object.keys(FEATURE_COLORS),
		layerCount: data.meta?.layer_count ?? layers.length,
	}
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
