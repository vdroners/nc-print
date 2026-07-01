import { describe, it, expect } from 'vitest'
import {
	buildSliceOverrides,
	mergedToOverrideForm,
	mergeProfileSettings,
	formatPrintTime,
	parseStlMetadata,
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
})
