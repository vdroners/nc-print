/** @vitest-environment node */
/**
 * Source contracts for the round-4 leftovers (1.74.0). Behavior lives in
 * the helper specs; this file checks the templates still wire them.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

function rule(src, selector) {
	const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	const match = src.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`))
	expect(match, selector).not.toBeNull()
	return match[1]
}

describe('GUI hunt round 4 wiring', () => {
	const temps = read('../components/TemperatureControl.vue')
	const spark = read('../components/TemperatureSparkline.vue')
	const palette = read('../components/CommandPalette.vue')
	const queue = read('../components/QueuePanel.vue')

	it('fills the 5-minute charts from temperature_store, not only on change', () => {
		expect(temps).toContain('server/temperature_store')
		expect(temps).toContain('samplesFromTemperatureSeries')
		expect(temps).toContain('appendTemperatureSample')
		expect(temps).not.toContain("printStore.printerState.extruderTemp'(val)")
		expect(spark).toContain('sparklineGeometry')
		expect(spark).toContain('ResizeObserver')
		expect(spark).toContain('width < 8')
	})

	it('lets the command palette scroll vertically without a horizontal bar', () => {
		const list = rule(palette, '.nc-print-cmdk__list')
		expect(list).toMatch(/overflow-x:\s*hidden/)
		expect(list).toMatch(/overflow-y:\s*auto/)
		expect(list).toMatch(/min-height:\s*0/)
		const item = rule(palette, '.nc-print-cmdk__item')
		expect(item).toMatch(/min-width:\s*0/)
		expect(item).toMatch(/box-sizing:\s*border-box/)
		expect(item).toMatch(/flex-wrap:\s*wrap/)
		expect(item).toMatch(/white-space:\s*normal/)
		const hint = rule(palette, '.nc-print-cmdk__hint')
		expect(hint).toMatch(/white-space:\s*normal/)
		expect(hint).not.toMatch(/flex:\s*0 0 auto/)
		expect(hint).toMatch(/overflow-wrap:\s*anywhere/)
		const title = rule(palette, '.nc-print-cmdk__title')
		expect(title).not.toMatch(/text-overflow:\s*ellipsis/)
		expect(title).toMatch(/white-space:\s*normal/)
	})

	it('shows the bed short label on the object row and keeps the full name on the tooltip', () => {
		expect(queue).toContain('visibleObjectLabel')
		expect(queue).toContain('rowLabel(obj)')
		expect(queue).toContain(':title="obj.name"')
		expect(queue).toContain('nc-print-queue__badge')
		expect(queue).toContain('Cancel object')
		expect(queue).not.toContain('>{{ obj.name }}<')
		expect(queue).not.toContain('nc-print-queue__short')
		const name = rule(queue, '.nc-print-queue__name')
		expect(name).toMatch(/min-width:\s*1\.25rem/)
	})
})