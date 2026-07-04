import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// The store pulls in several services at import time; stub them so the store
// can instantiate in the test environment.
vi.mock('@/services/toast.js', () => ({
	toastError: vi.fn(), toastSuccess: vi.fn(), toastWarning: vi.fn(), toastInfo: vi.fn(),
}))
vi.mock('@/services/slicer-api.js', () => ({
	fetchProfiles: vi.fn(async () => []),
	sliceStream: vi.fn(),
	downloadGcode: vi.fn(),
	uploadAndStart: vi.fn(),
	cancelSliceJob: vi.fn(),
}))
vi.mock('@/services/moonraker-api.js', () => ({ fetchState: vi.fn(async () => ({})), uploadAndStart: vi.fn() }))
vi.mock('@/services/config-api.js', () => ({ fetchConfig: vi.fn(async () => ({})) }))
vi.mock('@/services/status-api.js', () => ({ fetchAppStatus: vi.fn(async () => ({})) }))
vi.mock('@/services/files-api.js', () => ({ fetchModelBlob: vi.fn(), resolveFile: vi.fn() }))
vi.mock('@/services/gcode-save-api.js', () => ({ saveGcodeToFiles: vi.fn() }))
vi.mock('@/services/moonraker-ws.js', () => ({ MoonrakerWsClient: vi.fn() }))
vi.mock('@/services/mesh-convert.js', async (importOriginal) => {
	const actual = await importOriginal()
	return { ...actual, convert3mfToStlBuffer: vi.fn(), list3mfBuildItems: vi.fn(async () => []) }
})

import { usePrintStore } from '@/store/print.js'

describe('lastCompletedSliceStats getter', () => {
	beforeEach(() => {
		localStorage.clear()
		setActivePinia(createPinia())
	})

	it('is null until a slice is done', () => {
		const store = usePrintStore()
		expect(store.lastCompletedSliceStats).toBeNull()
	})

	it('reads model/support grams from materialStats (regression)', () => {
		const store = usePrintStore()
		// Simulate a completed slice with material breakdown, as
		// _applyMaterialStats would populate it.
		store.sliceJob.status = 'done'
		store.sliceJob.estimatedTimeS = 3600
		store.sliceJob.filamentUsedG = 42
		store.sliceJob.gcodeFilename = 'part.gcode'
		store.sliceJob.gcodeSizeBytes = 12345
		store.sliceJob.materialStats = { modelFilamentG: 38.5, supportFilamentG: 3.5 }

		const stats = store.lastCompletedSliceStats
		expect(stats).not.toBeNull()
		// These previously read j.modelFilamentG (undefined → null) — the bug.
		expect(stats.modelFilamentG).toBe(38.5)
		expect(stats.supportFilamentG).toBe(3.5)
		expect(stats.estimatedTimeS).toBe(3600)
		expect(stats.filamentUsedG).toBe(42)
		expect(stats.gcodeFilename).toBe('part.gcode')
	})

	it('falls back to null grams when materialStats is empty', () => {
		const store = usePrintStore()
		store.sliceJob.status = 'done'
		store.sliceJob.materialStats = {}
		const stats = store.lastCompletedSliceStats
		expect(stats.modelFilamentG).toBeNull()
		expect(stats.supportFilamentG).toBeNull()
	})
})

describe('pause-at-height actions', () => {
	beforeEach(() => {
		localStorage.clear()
		setActivePinia(createPinia())
	})

	it('adds pauses sorted by height and rejects invalid input', () => {
		const store = usePrintStore()
		expect(store.pauses).toEqual([])
		expect(store.addPause({ height: 10, type: 'pause' })).toBe(true)
		expect(store.addPause({ height: 5, type: 'filament_change' })).toBe(true)
		expect(store.addPause({ height: 0 })).toBe(false)
		expect(store.addPause({ height: 'x' })).toBe(false)
		expect(store.pauses.map(p => p.height)).toEqual([5, 10]) // sorted
		expect(store.pauses[0].type).toBe('filament_change')
	})

	it('removes and clears pauses', () => {
		const store = usePrintStore()
		store.addPause({ height: 3 })
		store.addPause({ height: 6 })
		store.removePause(0)
		expect(store.pauses.map(p => p.height)).toEqual([6])
		store.clearPauses()
		expect(store.pauses).toEqual([])
	})
})
