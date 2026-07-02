import { describe, it, expect } from 'vitest'
import {
	filamentMassG,
	filamentCost,
	parseRunoutSensors,
	parseActiveSpoolId,
	parseSpools,
	DEFAULT_DIAMETER_MM,
	DEFAULT_DENSITY_G_CM3,
} from '@/utils/filament.js'

describe('WS14: filament management', () => {
	// G42a: cost = f(length, density, price)
	it('computes filament mass from length', () => {
		// 1 m of 1.75mm PLA (density 1.24) ≈ 2.98 g
		const g = filamentMassG(1000, 1.75, 1.24)
		expect(g).toBeCloseTo(2.983, 2)
	})

	it('uses sane defaults', () => {
		expect(filamentMassG(1000)).toBeCloseTo(filamentMassG(1000, DEFAULT_DIAMETER_MM, DEFAULT_DENSITY_G_CM3))
	})

	it('returns 0 mass for invalid input', () => {
		expect(filamentMassG(-5)).toBe(0)
		expect(filamentMassG(1000, 0)).toBe(0)
		expect(filamentMassG(NaN)).toBe(0)
	})

	it('computes cost when a price is supplied', () => {
		const { massG, cost } = filamentCost(10000, { pricePerKg: 25 })
		expect(massG).toBeGreaterThan(0)
		// mass in kg * price
		expect(cost).toBeCloseTo((massG / 1000) * 25, 6)
	})

	it('returns null cost when no price', () => {
		const { cost } = filamentCost(10000, {})
		expect(cost).toBeNull()
	})

	// G42a: runout status parse
	it('parses runout switch + motion sensors', () => {
		const sensors = parseRunoutSensors({
			result: {
				status: {
					'filament_switch_sensor e0': { filament_detected: true, enabled: true },
					'filament_motion_sensor smart': { filament_detected: false, enabled: false },
					extruder: { temperature: 200 },
				},
			},
		})
		expect(sensors).toHaveLength(2)
		const sw = sensors.find(s => s.type === 'switch')
		expect(sw.name).toBe('e0')
		expect(sw.detected).toBe(true)
		const motion = sensors.find(s => s.type === 'motion')
		expect(motion.detected).toBe(false)
		expect(motion.enabled).toBe(false)
	})

	it('parses the active spool id', () => {
		expect(parseActiveSpoolId({ result: { spool_id: 7 } })).toBe(7)
		expect(parseActiveSpoolId({ spool_id: null })).toBeNull()
	})

	it('parses a Spoolman spool list', () => {
		const spools = parseSpools([
			{ id: 1, remaining_weight: 800, used_weight: 200, filament: { name: 'Prusament PLA', material: 'PLA', color_hex: 'ff8800' } },
			{ id: 2, remaining_weight: 500, filament: { name: 'PETG', material: 'PETG' } },
		])
		expect(spools).toHaveLength(2)
		expect(spools[0].name).toBe('Prusament PLA')
		expect(spools[0].color).toBe('#ff8800')
		expect(spools[0].remainingG).toBe(800)
		expect(spools[1].color).toBeNull()
	})
})
