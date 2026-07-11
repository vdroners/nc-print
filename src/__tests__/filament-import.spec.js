import { describe, it, expect } from 'vitest'
import { parseOrcaFilamentJson, MAX_IMPORT_BYTES } from '@/services/filament-import.js'

describe('parseOrcaFilamentJson', () => {
	it('maps array-valued Orca keys to the override form (index 0)', () => {
		const { form, applied } = parseOrcaFilamentJson(JSON.stringify({
			nozzle_temperature: ['220'],
			hot_plate_temp: ['60'],
			fan_max_speed: ['100'],
			filament_retraction_length: ['0.8'],
		}))
		expect(form.nozzleTemp).toBe(220)
		expect(form.bedTemp).toBe(60)
		expect(form.fanSpeed).toBe(100)
		expect(form.retractionLength).toBe(0.8)
		expect(applied.length).toBe(4)
	})

	it('accepts scalar values too', () => {
		const { form } = parseOrcaFilamentJson({ nozzle_temperature: 215 })
		expect(form.nozzleTemp).toBe(215)
	})

	it('first present bed-temp key wins (no double-map)', () => {
		const { form } = parseOrcaFilamentJson({ hot_plate_temp: ['60'], cool_plate_temp: ['35'] })
		expect(form.bedTemp).toBe(60)
	})

	it('reports unmapped keys as ignored, does not apply them', () => {
		const { form, ignored } = parseOrcaFilamentJson({
			nozzle_temperature: ['210'],
			some_unknown_key: ['x'],
			another: 1,
		})
		expect(form.nozzleTemp).toBe(210)
		expect(ignored).toContain('some_unknown_key')
		expect(ignored).toContain('another')
		expect('some_unknown_key' in form).toBe(false)
	})

	it('warns when nothing recognised', () => {
		const { applied, warnings } = parseOrcaFilamentJson({ foo: 1, bar: 2 })
		expect(applied).toEqual([])
		expect(warnings.length).toBeGreaterThan(0)
	})

	it('rejects invalid JSON', () => {
		expect(() => parseOrcaFilamentJson('{not json')).toThrow(/valid JSON/i)
	})

	it('rejects non-object payloads', () => {
		expect(() => parseOrcaFilamentJson('[1,2,3]')).toThrow(/object/i)
		expect(() => parseOrcaFilamentJson('"a string"')).toThrow(/object/i)
	})

	it('rejects oversize input', () => {
		const big = '{"x":"' + 'a'.repeat(MAX_IMPORT_BYTES) + '"}'
		expect(() => parseOrcaFilamentJson(big)).toThrow(/too large/i)
	})

	it('ignores non-numeric values for numeric fields', () => {
		const { form, applied } = parseOrcaFilamentJson({ nozzle_temperature: ['abc'] })
		expect('nozzleTemp' in form).toBe(false)
		expect(applied).toEqual([])
	})
})
