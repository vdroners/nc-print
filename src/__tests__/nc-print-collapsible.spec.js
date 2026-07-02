import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
	collapsibleStorageKey,
	loadCollapsibleState,
	saveCollapsibleState,
} from '@/utils/collapsible.js'

function makeStorage() {
	const map = new Map()
	return {
		getItem: vi.fn((k) => (map.has(k) ? map.get(k) : null)),
		setItem: vi.fn((k, v) => map.set(k, String(v))),
		removeItem: vi.fn((k) => map.delete(k)),
	}
}

describe('NcPrintCollapsible state (G29a)', () => {
	beforeEach(() => {
		global.localStorage = makeStorage()
	})

	it('namespaces the persistence key per section id', () => {
		expect(collapsibleStorageKey('prepare-transform')).toBe('nc_print_collapsible_prepare-transform')
	})

	it('falls back to the default when nothing is stored', () => {
		expect(loadCollapsibleState('sec', true)).toBe(true)
		expect(loadCollapsibleState('sec', false)).toBe(false)
	})

	it('persists and restores toggled state independent of the default', () => {
		saveCollapsibleState('sec', false)
		expect(loadCollapsibleState('sec', true)).toBe(false)
		saveCollapsibleState('sec', true)
		expect(loadCollapsibleState('sec', false)).toBe(true)
	})

	it('survives storage errors gracefully', () => {
		global.localStorage = {
			getItem: () => { throw new Error('blocked') },
			setItem: () => { throw new Error('blocked') },
		}
		expect(() => saveCollapsibleState('sec', true)).not.toThrow()
		expect(loadCollapsibleState('sec', true)).toBe(true)
	})
})
