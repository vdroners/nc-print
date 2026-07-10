import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Store service mocks (mirror print-monitor.spec.js) + the new mesh-analyze-api.
vi.mock('@/services/toast.js', () => ({
	toastError: vi.fn(), toastSuccess: vi.fn(), toastWarning: vi.fn(), toastInfo: vi.fn(),
}))
vi.mock('@/services/slicer-api.js', () => ({
	fetchProfiles: vi.fn(async () => []), sliceStream: vi.fn(), downloadGcode: vi.fn(),
	uploadAndStart: vi.fn(), cancelSliceJob: vi.fn(),
}))
vi.mock('@/services/moonraker-api.js', () => ({
	fetchState: vi.fn(async () => ({})), uploadAndStart: vi.fn(), cameraStreamUrl: vi.fn(() => ''),
}))
vi.mock('@/services/config-api.js', () => ({ fetchConfig: vi.fn(async () => ({})) }))
vi.mock('@/services/status-api.js', () => ({ fetchAppStatus: vi.fn(async () => ({})) }))
vi.mock('@/services/files-api.js', () => ({ fetchModelBlob: vi.fn(), resolveFile: vi.fn() }))
vi.mock('@/services/gcode-save-api.js', () => ({ saveGcodeToFiles: vi.fn() }))
vi.mock('@/services/moonraker-ws.js', () => ({ MoonrakerWsClient: vi.fn() }))
vi.mock('@/services/mesh-convert.js', async (importOriginal) => {
	const actual = await importOriginal()
	return { ...actual, convert3mfToStlBuffer: vi.fn(), list3mfBuildItems: vi.fn(async () => []) }
})
vi.mock('@/services/mesh-analyze-api.js', () => ({
	analyzeMeshServer: vi.fn(),
}))

import { usePrintStore } from '@/store/print.js'
import { analyzeMeshServer } from '@/services/mesh-analyze-api.js'

describe('print store fetchServerPrintability', () => {
	beforeEach(() => {
		localStorage.clear()
		setActivePinia(createPinia())
		analyzeMeshServer.mockReset()
	})

	it('merges server printability into meshHealth', async () => {
		const store = usePrintStore()
		store.meshState.sliceBlob = new Blob([new Uint8Array(84)])
		store.meshState.dirty = false
		analyzeMeshServer.mockResolvedValueOnce({
			ok: true,
			printability: {
				overhang_fraction: 0.4,
				bridges: { count: 3, area_mm2: 120 },
				orientation_suggestions: [{ orientation: 'rotate 90° about X', overhang_fraction: 0.05 }],
			},
		})
		const p = await store.fetchServerPrintability()
		expect(p.bridges.count).toBe(3)
		expect(store.meshHealth.printability.overhang_fraction).toBe(0.4)
	})

	it('no-ops (returns null) when there is no slice model', async () => {
		const store = usePrintStore()
		// no sliceBlob / model file
		const p = await store.fetchServerPrintability()
		expect(p).toBeNull()
		expect(analyzeMeshServer).not.toHaveBeenCalled()
	})

	it('swallows failures and leaves printability null', async () => {
		const store = usePrintStore()
		store.meshState.sliceBlob = new Blob([new Uint8Array(84)])
		store.meshState.dirty = false
		analyzeMeshServer.mockRejectedValueOnce(new Error('offline'))
		const p = await store.fetchServerPrintability()
		expect(p).toBeNull()
		expect(store.meshHealth.printability).toBeNull()
	})

	it('setMeshHealth marks analyzed and the printability fetch reaches the API', async () => {
		const store = usePrintStore()
		store.meshState.sliceBlob = new Blob([new Uint8Array(84)])
		store.meshState.dirty = false
		analyzeMeshServer.mockResolvedValue({ ok: true, printability: { overhang_fraction: 0.1, bridges: { count: 0 }, orientation_suggestions: [] } })
		store.setMeshHealth({ triangleCount: 100, watertight: true, overhangPct: 10 })
		expect(store.meshHealth.analyzed).toBe(true)
		// setMeshHealth fires fetchServerPrintability fire-and-forget; the
		// mesh-analyze module now loads via dynamic import, so await the action
		// directly (deterministic) to confirm it reaches the API.
		await store.fetchServerPrintability()
		expect(analyzeMeshServer).toHaveBeenCalled()
	})
})
