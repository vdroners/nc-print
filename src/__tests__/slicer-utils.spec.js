import { describe, it, expect } from 'vitest'
import {
	buildSliceOverrides,
	mergedToOverrideForm,
	mergedToOverrideFormFull,
	isOverrideModified,
	QUALITY_TIERS,
	mergeProfileSettings,
	formatPrintTime,
	parseStlMetadata,
	diffOverrides,
	estimateFilamentCost,
	resolveFilamentPricePerKg,
	groupsForMode,
	levelVisible,
	matchesSearch,
	cleanOverrides,
	OVERRIDE_FIELD_DEFS,
} from '@/services/slicer-utils.js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('slicer-utils', () => {
	it('buildSliceOverrides maps form fields', () => {
		const o = buildSliceOverrides({
			layerHeight: '0.2',
			infillDensity: '20',
			nozzleTemp: '210',
		})
		expect(o.layer_height).toBe(0.2)
		expect(o.infill_density).toBeCloseTo(0.2)
		expect(o.nozzle_temperature).toBe(210)
	})

	it('buildSliceOverrides maps support and adhesion fields', () => {
		const o = buildSliceOverrides({
			enableSupport: true,
			supportType: 'tree',
			supportThreshold: '45',
			brimWidth: '5',
			raftLayers: '2',
			skirtLoops: '1',
		})
		expect(o.enable_support).toBe(true)
		expect(o.support_type).toBe('tree')
		expect(o.support_threshold).toBe(45)
		expect(o.brim_width).toBe(5)
		expect(o.raft_layers).toBe(2)
		expect(o.skirt_loops).toBe(1)
	})

	it('buildSliceOverrides maps surface-quality fields', () => {
		const o = buildSliceOverrides({
			adaptiveLayerHeight: true,
			ironingType: 'top',
			fuzzySkin: 'external',
			seamPosition: 'aligned',
		})
		expect(o.adaptive_layer_height).toBe(true)
		expect(o.ironing_type).toBe('top')
		expect(o.fuzzy_skin).toBe('external')
		expect(o.seam_position).toBe('aligned')
	})

	it('buildSliceOverrides maps patterns, per-feature speeds, support interface + first-layer', () => {
		const o = buildSliceOverrides({
			infillPattern: 'gyroid',
			topSurfacePattern: 'monotonic',
			bottomSurfacePattern: 'concentric',
			infillSpeed: '120',
			solidInfillSpeed: '90',
			supportTopGap: '0.2',
			supportInterfaceLayers: '2',
			supportInterfaceSpacing: '0.2',
			firstLayerHeight: '0.25',
		})
		expect(o.infill_pattern).toBe('gyroid')
		expect(o.top_surface_pattern).toBe('monotonic')
		expect(o.bottom_surface_pattern).toBe('concentric')
		expect(o.infill_speed).toBe(120)
		expect(o.solid_infill_speed).toBe(90)
		expect(o.support_top_gap).toBe(0.2)
		expect(o.support_interface_layers).toBe(2)
		expect(o.support_interface_spacing).toBe(0.2)
		expect(o.first_layer_height).toBe(0.25)
	})

	it('buildSliceOverrides maps wipe/prime tower fields', () => {
		const o = buildSliceOverrides({
			enablePrimeTower: true,
			primeTowerWidth: '60',
			primeTowerBrimWidth: '3',
			primeVolume: '45',
			wipeTowerRotation: '90',
			wipeTowerExtraSpacing: '150',
		})
		expect(o.enable_prime_tower).toBe(true)
		expect(o.prime_tower_width).toBe(60)
		expect(o.prime_tower_brim_width).toBe(3)
		expect(o.prime_volume).toBe(45)
		expect(o.wipe_tower_rotation).toBe(90)
		expect(o.wipe_tower_extra_spacing).toBe(150)
	})

	it('buildSliceOverrides maps quality + ironing/support detail fields', () => {
		const o = buildSliceOverrides({
			overhangSpeed1: '0', overhangSpeed4: '10',
			topShellLayers: '5', bottomShellLayers: '4',
			bridgeSpeed: '40', bridgeFlow: '0.9', bridgeNoSupport: true,
			elephantFoot: '0.2', infillWallOverlap: '25',
			ironingFlow: '12', ironingSpacing: '0.12', ironingSpeed: '25',
			supportInterfaceBottomLayers: '2', supportBasePattern: 'rectilinear',
			treeSupportBranchAngle: '40', draftShield: 'enabled',
		})
		expect(o.overhang_speed_1).toBe(0)
		expect(o.overhang_speed_4).toBe(10)
		expect(o.top_shell_layers).toBe(5)
		expect(o.bottom_shell_layers).toBe(4)
		expect(o.bridge_speed).toBe(40)
		expect(o.bridge_flow).toBe(0.9)
		expect(o.bridge_no_support).toBe(true)
		expect(o.elephant_foot).toBe(0.2)
		expect(o.infill_wall_overlap).toBe(25)
		expect(o.ironing_flow).toBe(12)
		expect(o.ironing_spacing).toBe(0.12)
		expect(o.ironing_speed).toBe(25)
		expect(o.support_interface_bottom_layers).toBe(2)
		expect(o.support_base_pattern).toBe('rectilinear')
		expect(o.tree_support_branch_angle).toBe(40)
		expect(o.draft_shield).toBe('enabled')
	})

	it('buildSliceOverrides omits empty quality fields', () => {
		const o = buildSliceOverrides({ overhangSpeed1: '', topShellLayers: '', bridgeFlow: '', supportBasePattern: '' })
		expect('overhang_speed_1' in o).toBe(false)
		expect('top_shell_layers' in o).toBe(false)
		expect('bridge_flow' in o).toBe(false)
		expect('support_base_pattern' in o).toBe(false)
	})

	it('buildSliceOverrides omits the prime tower when disabled/empty', () => {
		const o = buildSliceOverrides({ enablePrimeTower: false, primeTowerWidth: '' })
		expect(o.enable_prime_tower).toBe(false) // bool always emitted when set
		expect('prime_tower_width' in o).toBe(false)
	})

	it('buildSliceOverrides omits empty pattern/speed fields', () => {
		const o = buildSliceOverrides({ infillPattern: '', infillSpeed: '', firstLayerHeight: '' })
		expect('infill_pattern' in o).toBe(false)
		expect('infill_speed' in o).toBe(false)
		expect('first_layer_height' in o).toBe(false)
	})

	it('buildSliceOverrides omits empty surface-quality fields', () => {
		const o = buildSliceOverrides({ ironingType: '', fuzzySkin: '', seamPosition: '' })
		expect('ironing_type' in o).toBe(false)
		expect('fuzzy_skin' in o).toBe(false)
		expect('seam_position' in o).toBe(false)
	})

	it('mergeProfileSettings merges settings_json', () => {
		const merged = mergeProfileSettings(
			{
				printers: [{ id: '1', settings_json: '{"layerHeight":0.16}' }],
				filaments: [{ id: '2', settings_json: '{"nozzleTemp":220}' }],
				processes: [],
			},
			{ printerId: '1', filamentId: '2', processId: '' },
		)
		expect(merged.layerHeight).toBe(0.16)
		expect(merged.nozzleTemp).toBe(220)
	})

	it('mergedToOverrideForm maps keys', () => {
		const form = mergedToOverrideForm({ layer_height: 0.2, infill_density: 0.15 })
		expect(form.layerHeight).toBe(0.2)
		expect(form.infillDensity).toBe(15)
	})

	it('buildSliceOverrides maps bedType → bed_type', () => {
		expect(buildSliceOverrides({ bedType: 'Textured PEI Plate' }).bed_type).toBe('Textured PEI Plate')
		expect('bed_type' in buildSliceOverrides({ bedType: '' })).toBe(false)
	})

	it('mergedToOverrideForm seeds bedType from curr_bed_type/default_bed_type', () => {
		expect(mergedToOverrideForm({ curr_bed_type: 'Cool Plate' }).bedType).toBe('Cool Plate')
		expect(mergedToOverrideForm({ default_bed_type: 'Smooth PEI Plate' }).bedType).toBe('Smooth PEI Plate')
		expect(mergedToOverrideForm({}).bedType).toBe('')
	})

	it('mergedToOverrideFormFull maps advanced engine keys (not just basics)', () => {
		const full = mergedToOverrideFormFull({
			outer_wall_speed: 120,
			sparse_infill_speed: 200,        // advanced (not in the basic map)
			overhang_1_4_speed: 50,          // advanced
			sparse_infill_density: 0.15,     // pct → 15
			enable_support: 1,               // bool
			ironing_type: 'top',             // str
			infill_wall_overlap: 0.25,       // pct fraction → 25
		})
		expect(full.printSpeed).toBe(120)
		expect(full.infillSpeed).toBe(200)
		expect(full.overhangSpeed1).toBe(50)
		expect(full.infillDensity).toBe(15)
		expect(full.enableSupport).toBe(true)
		expect(full.ironingType).toBe('top')
		expect(full.infillWallOverlap).toBe(25)
	})

	it('isOverrideModified: empty field = not modified; different value = modified', () => {
		const baseline = mergedToOverrideFormFull({ layer_height: 0.2, sparse_infill_speed: 200 })
		// unset override → not modified
		expect(isOverrideModified('layerHeight', { layerHeight: '' }, baseline)).toBe(false)
		// same as baseline → not modified
		expect(isOverrideModified('layerHeight', { layerHeight: 0.2 }, baseline)).toBe(false)
		// different → modified
		expect(isOverrideModified('layerHeight', { layerHeight: 0.3 }, baseline)).toBe(true)
		expect(isOverrideModified('infillSpeed', { infillSpeed: 250 }, baseline)).toBe(true)
	})

	it('QUALITY_TIERS expose draft/standard/fine layer heights', () => {
		const ids = QUALITY_TIERS.map((t) => t.id)
		expect(ids).toEqual(['draft', 'standard', 'fine'])
		expect(QUALITY_TIERS.find((t) => t.id === 'standard').layerHeight).toBe(0.2)
	})

	it('formatPrintTime', () => {
		expect(formatPrintTime(3665)).toBe('1h 1m')
		expect(formatPrintTime(120)).toBe('2 min')
	})

	it('parseStlMetadata returns shape for fixture buffer', () => {
		const buf = readFileSync(resolve(__dirname, '../../tests/fixtures/cube10.stl'))
		const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
		const meta = parseStlMetadata(ab)
		expect(meta).toHaveProperty('triangleCount')
		expect(meta).toHaveProperty('bbox')
	})

	it('parseStlMetadata parses ASCII STL without binary mis-read', () => {
		const ascii = [
			'solid cube',
			'  facet normal 0 0 1',
			'    outer loop',
			'      vertex 0 0 0',
			'      vertex 1 0 0',
			'      vertex 0 1 0',
			'    endloop',
			'  endfacet',
			'endsolid cube',
		].join('\n')
		const ab = new TextEncoder().encode(ascii).buffer
		const meta = parseStlMetadata(ab)
		expect(meta.triangleCount).toBe(1)
		expect(meta.bbox).toEqual({ x: 1, y: 1, z: 0 })
		expect(meta.note).toBe('ASCII STL')
	})

	it('parseStlMetadata returns note when ASCII STL has no vertices', () => {
		const ab = new TextEncoder().encode('solid empty\nendsolid empty').buffer
		const meta = parseStlMetadata(ab)
		expect(meta.triangleCount).toBe(0)
		expect(meta.bbox).toBeNull()
		expect(meta.note).toContain('ASCII STL')
	})

	it('diffOverrides includes fan, retraction, and support fields', () => {
		const rows = diffOverrides({
			layerHeight: '',
			fanSpeed: 50,
			retractionLength: 1.2,
			enableSupport: true,
			supportType: 'tree',
			brimWidth: 5,
		}, {
			fan_speed: 100,
			retraction_length: 0.8,
			enable_support: false,
			support_type: 'normal',
			brim_width: 0,
		})
		const keys = rows.map(r => r.key)
		expect(keys).toContain('fanSpeed')
		expect(keys).toContain('retractionLength')
		expect(keys).toContain('enableSupport')
		expect(keys).toContain('supportType')
		expect(keys).toContain('brimWidth')
		const supportRow = rows.find(r => r.key === 'enableSupport')
		expect(supportRow?.overrideValue).toBe('On')
		expect(supportRow?.defaultValue).toBe('Off')
	})

	it('resolveFilamentPricePerKg prefers profile over config', () => {
		expect(resolveFilamentPricePerKg({ default_filament_price_kg: 20 }, { price_per_kg: 25 })).toBe(25)
		expect(resolveFilamentPricePerKg({ default_filament_price_kg: 20 }, {})).toBe(20)
		expect(resolveFilamentPricePerKg({}, {})).toBeNull()
	})

	it('estimateFilamentCost computes grams * price per kg', () => {
		expect(estimateFilamentCost(50, 20)).toBeCloseTo(1)
		expect(estimateFilamentCost(0, 20)).toBeNull()
		expect(estimateFilamentCost(50, null)).toBeNull()
	})
})

describe('settings tree (v1.65)', () => {
	it('every override def carries a level + group tag', () => {
		for (const d of OVERRIDE_FIELD_DEFS) {
			expect(['basic', 'advanced', 'expert'], `${d.key} level`).toContain(d.level)
			expect(typeof d.group, `${d.key} group`).toBe('string')
			expect(d.group.length).toBeGreaterThan(0)
		}
	})

	it('levelVisible is cumulative: expert ⊇ advanced ⊇ basic', () => {
		expect(levelVisible('basic', 'basic')).toBe(true)
		expect(levelVisible('advanced', 'basic')).toBe(false)
		expect(levelVisible('expert', 'basic')).toBe(false)
		expect(levelVisible('basic', 'advanced')).toBe(true)
		expect(levelVisible('advanced', 'advanced')).toBe(true)
		expect(levelVisible('expert', 'advanced')).toBe(false)
		expect(levelVisible('basic', 'expert')).toBe(true)
		expect(levelVisible('expert', 'expert')).toBe(true)
	})

	it('groupsForMode returns fewer fields in Simple than Expert', () => {
		const count = (groups) => groups.reduce((n, g) => n + g.fields.length, 0)
		const simple = count(groupsForMode('basic'))
		const advanced = count(groupsForMode('advanced'))
		const expert = count(groupsForMode('expert'))
		expect(simple).toBeGreaterThan(0)
		expect(advanced).toBeGreaterThan(simple)
		expect(expert).toBeGreaterThan(advanced)
		// Expert shows everything.
		expect(expert).toBe(OVERRIDE_FIELD_DEFS.length)
	})

	it('groupsForMode preserves group order + drops empty groups', () => {
		const groups = groupsForMode('expert')
		expect(groups[0].group).toBe('Quality') // first def is a Quality field
		for (const g of groups) {
			expect(g.fields.length).toBeGreaterThan(0)
		}
	})

	it('matchesSearch filters by label, key, or group (case-insensitive)', () => {
		const layerDef = OVERRIDE_FIELD_DEFS.find((d) => d.key === 'layerHeight')
		expect(matchesSearch(layerDef, '')).toBe(true) // empty matches all
		expect(matchesSearch(layerDef, 'LAYER')).toBe(true) // label
		expect(matchesSearch(layerDef, 'layerHeight')).toBe(true) // key
		expect(matchesSearch(layerDef, 'quality')).toBe(true) // group
		expect(matchesSearch(layerDef, 'zzz-nope')).toBe(false)
	})

	it('groupsForMode + search narrows to matching fields', () => {
		const groups = groupsForMode('expert', 'ironing')
		const keys = groups.flatMap((g) => g.fields.map((f) => f.key))
		expect(keys).toContain('ironingType')
		expect(keys).not.toContain('layerHeight')
	})
})

describe('cleanOverrides (v1.66)', () => {
	it('drops empty / null / undefined values', () => {
		expect(cleanOverrides({ layerHeight: '0.2', lineWidth: '', perimeters: null, brimWidth: undefined }))
			.toEqual({ layerHeight: '0.2' })
	})

	it('treats an unchecked support box as inherit (dropped)', () => {
		expect(cleanOverrides({ enableSupport: false, perimeters: '4' })).toEqual({ perimeters: '4' })
		expect(cleanOverrides({ enableSupport: true })).toEqual({ enableSupport: true })
	})

	it('empty map stays empty', () => {
		expect(cleanOverrides({})).toEqual({})
		expect(cleanOverrides(null)).toEqual({})
	})
})
