import { describe, it, expect, vi } from 'vitest'
import { panelVisibility } from '@/mixins/panelVisibility.js'

/**
 * The mixin is a thin contract: a `panelVisible` computed default (false) and a
 * `panelVisible` watcher (immediate) that $emits `visible`. We exercise the
 * pieces directly against a mock `this` — no component mount needed (matches the
 * repo's store/util spec convention).
 */
describe('panelVisibility mixin', () => {
	it('defaults panelVisible to false', () => {
		expect(panelVisibility.computed.panelVisible.call({})).toBe(false)
	})

	it('watches panelVisible immediately and emits the boolean', () => {
		const watcher = panelVisibility.watch.panelVisible
		expect(watcher.immediate).toBe(true)
		const emit = vi.fn()
		watcher.handler.call({ $emit: emit }, true)
		expect(emit).toHaveBeenCalledWith('visible', true)
	})

	it('coerces truthy/falsy values to a boolean', () => {
		const emit = vi.fn()
		const h = panelVisibility.watch.panelVisible.handler
		h.call({ $emit: emit }, 0)
		h.call({ $emit: emit }, 'x')
		h.call({ $emit: emit }, null)
		expect(emit.mock.calls.map((c) => c[1])).toEqual([false, true, false])
	})
})
