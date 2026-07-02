import { describe, it, expect } from 'vitest'
import {
	TEMP_PRESETS,
	presetToTargets,
	sensorLabel,
	isHeaterKey,
	parseTemperatureStore,
	seriesToPoints,
	decimate,
	temperatureDomain,
} from '@/utils/temperature.js'

describe('WS10: temperature graph helpers', () => {
	// G38a: presets map to correct target temps
	it('presets map to correct targets', () => {
		expect(presetToTargets('pla')).toEqual({ nozzle: 210, bed: 60 })
		expect(presetToTargets('PETG')).toEqual({ nozzle: 240, bed: 80 })
		expect(presetToTargets('abs')).toEqual({ nozzle: 250, bed: 100 })
		expect(presetToTargets('off')).toEqual({ nozzle: 0, bed: 0 })
		expect(presetToTargets('nope')).toBeNull()
		expect(TEMP_PRESETS.pla.label).toBe('PLA')
	})

	it('labels sensors readably', () => {
		expect(sensorLabel('extruder')).toBe('Nozzle')
		expect(sensorLabel('extruder1')).toBe('Nozzle 1')
		expect(sensorLabel('heater_bed')).toBe('Bed')
		expect(sensorLabel('temperature_sensor chamber')).toBe('chamber')
		expect(sensorLabel('mystery')).toBe('mystery')
	})

	it('classifies heater keys', () => {
		expect(isHeaterKey('extruder')).toBe(true)
		expect(isHeaterKey('heater_bed')).toBe(true)
		expect(isHeaterKey('heater_generic chamber')).toBe(true)
		expect(isHeaterKey('temperature_sensor chamber')).toBe(false)
	})

	// G38a: parser maps temperature_store payload → series arrays
	it('parses temperature_store payload into series', () => {
		const payload = {
			result: {
				extruder: { temperatures: [200, 205, 210], targets: [210, 210, 210], powers: [1, 0.5, 0.2] },
				heater_bed: { temperatures: [58, 59, 60], targets: [60, 60, 60] },
				'temperature_sensor chamber': { temperatures: [30, 31, 32] },
			},
		}
		const series = parseTemperatureStore(payload)
		expect(series).toHaveLength(3)
		// deterministic order: extruder, heater_bed, then sensors
		expect(series[0].key).toBe('extruder')
		expect(series[0].label).toBe('Nozzle')
		expect(series[0].isHeater).toBe(true)
		expect(series[0].temperatures).toEqual([200, 205, 210])
		expect(series[1].key).toBe('heater_bed')
		expect(series[2].key).toBe('temperature_sensor chamber')
		expect(series[2].isHeater).toBe(false)
	})

	it('parses a bare (non-enveloped) payload and skips empty series', () => {
		const series = parseTemperatureStore({
			extruder: { temperatures: [180] },
			bogus: { temperatures: [] },
			junk: 'nope',
		})
		expect(series.map(s => s.key)).toEqual(['extruder'])
	})

	it('returns [] for non-object payloads', () => {
		expect(parseTemperatureStore(null)).toEqual([])
		expect(parseTemperatureStore('x')).toEqual([])
	})

	it('computes a padded domain', () => {
		const series = parseTemperatureStore({
			extruder: { temperatures: [200, 245], targets: [250] },
		})
		const d = temperatureDomain(series)
		expect(d.min).toBe(0)
		expect(d.max).toBeGreaterThanOrEqual(260)
	})

	it('builds SVG points scaled into the viewbox', () => {
		const pts = seriesToPoints([0, 50, 100], { width: 100, height: 100, min: 0, max: 100 })
		const coords = pts.split(' ')
		expect(coords).toHaveLength(3)
		// first sample bottom (0° → y=height), last sample top (100° → y=0)
		expect(coords[0]).toBe('0.0,100.0')
		expect(coords[2]).toBe('100.0,0.0')
	})

	it('decimates long series to the target length keeping endpoints', () => {
		const long = Array.from({ length: 1000 }, (_, i) => i)
		const out = decimate(long, 100)
		expect(out).toHaveLength(100)
		expect(out[0]).toBe(0)
		expect(out[out.length - 1]).toBe(999)
	})
})
