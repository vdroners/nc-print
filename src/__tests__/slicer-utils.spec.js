import { describe, it, expect } from 'vitest'
import {
	buildSliceOverrides,
	mergedToOverrideForm,
	mergeProfileSettings,
	formatPrintTime,
	parseStlMetadata,
	diffOverrides,
	estimateFilamentCost,
	resolveFilamentPricePerKg,
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
