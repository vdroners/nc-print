import { describe, it, expect } from 'vitest'
import {
	TEMP_PRESETS,
	followLiveTarget,
	presetToTargets,
	sensorLabel,
	isHeaterKey,
	parseTemperatureStore,
	seriesToPoints,
	decimate,
	temperatureDomain,
	SPARKLINE_WINDOW_MS,
	samplesFromTemperatureSeries,
	appendTemperatureSample,
	sparklineGeometry,
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

	it('follows a live heater target and does not invent PLA defaults', () => {
		expect(followLiveTarget('', 275, false)).toBe('275')
		expect(followLiveTarget('', 64.6, false)).toBe('65')
		expect(followLiveTarget('', null, false)).toBe('')
		expect(followLiveTarget('', 0, false)).toBe('')
		expect(followLiveTarget('200', 275, true)).toBe('200')
		expect(followLiveTarget('', undefined, false)).not.toBe('210')
		expect(followLiveTarget('', undefined, false)).not.toBe('60')
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

describe('5-minute sparkline while a heater is steady', () => {
	const now = 1_700_000_000_000

	it('anchors the temperature_store tail at now across the 5-minute window', () => {
		const temperatures = Array.from({ length: 1200 }, (_, i) => 278)
		const samples = samplesFromTemperatureSeries(temperatures, { now })
		expect(samples.length).toBe(300)
		expect(samples[0].t).toBe(now - 299_000)
		expect(samples[samples.length - 1]).toEqual({ t: now, value: 278 })
		expect(samples[0].t).toBeGreaterThanOrEqual(now - SPARKLINE_WINDOW_MS)
	})

	it('keeps a steady reading when the value does not change', () => {
		let samples = appendTemperatureSample([], 65, now - 60_000)
		samples = appendTemperatureSample(samples, 65, now)
		expect(samples).toEqual([
			{ t: now - 60_000, value: 65 },
			{ t: now, value: 65 },
		])
		expect(appendTemperatureSample(samples, 'nope', now + 1000)).toEqual(samples)
	})

	it('draws a flat print temperature as a line across the plot, not a bottom tick', () => {
		const samples = samplesFromTemperatureSeries(
			Array.from({ length: 300 }, () => 278),
			{ now },
		)
		const layout = sparklineGeometry(samples, { width: 240, height: 120, now })
		expect(layout.ready).toBe(true)
		expect(layout.commands[0].x).toBeLessThan(5)
		expect(layout.commands[layout.commands.length - 1].x).toBe(240)
		for (const point of layout.commands) {
			expect(point.y).toBeCloseTo(60, 5)
		}
		// A 2° wobble stays in the plot instead of a 1px spike on the edge.
		const wobble = samples.map((p, i) => ({ ...p, value: i % 2 ? 279 : 277 }))
		const waved = sparklineGeometry(wobble, { width: 240, height: 120, now })
		const ys = waved.commands.map((p) => p.y)
		expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(20)
		expect(Math.min(...ys)).toBeGreaterThan(6)
		expect(Math.max(...ys)).toBeLessThan(114)
	})
})
