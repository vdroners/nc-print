import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/services/toast.js', () => ({
	toastError: vi.fn(), toastSuccess: vi.fn(), toastWarning: vi.fn(), toastInfo: vi.fn(),
}))
vi.mock('@/services/slicer-api.js', () => ({
	fetchProfiles: vi.fn(async () => []), sliceStream: vi.fn(), sliceStreamMulti: vi.fn(),
	downloadGcode: vi.fn(), uploadAndStart: vi.fn(), cancelSliceJob: vi.fn(),
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

// A K1 Max printer profile as the engine returns it (bed in printable_area).
const K1MAX = {
	id: 'Creality K1 Max (0.4 nozzle)',
	name: 'Creality K1 Max (0.4 nozzle)',
	kind: 'printer',
	settings: { printable_area: '0x0,300x0,300x300,0x300', printable_height: '300' },
}

describe('buildVolume resolution', () => {
	beforeEach(() => {
		localStorage.clear()
		setActivePinia(createPinia())
	})

	it('defaults to 220 when no profile and no scan', () => {
		const store = usePrintStore()
		expect(store.buildVolume).toEqual([220, 220, 220])
	})

	it('uses the profile printable_area when a profile is selected (no scan)', () => {
		const store = usePrintStore()
		store.profiles.printers = [K1MAX]
		store.selection.printerId = K1MAX.id
		expect(store.buildVolume).toEqual([300, 300, 300])
	})

	it('prefers the live scanned bed over the profile', () => {
		const store = usePrintStore()
		store.profiles.printers = [K1MAX]
		store.selection.printerId = K1MAX.id
		// Connected printer with a scanned bed (Moonraker axis extent).
		store.config = { multi_printers: [{ id: 'k1max', name: 'K1 Max', default: true }] }
		store.selectedPrinterId = 'k1max'
		store.printerCapabilities = { k1max: { build_volume: { x: 306, y: 306, z: 305 } } }
		expect(store.buildVolume).toEqual([306, 306, 305])
	})

	it('falls back to the profile when the scan lacks a build volume', () => {
		const store = usePrintStore()
		store.profiles.printers = [K1MAX]
		store.selection.printerId = K1MAX.id
		store.config = { multi_printers: [{ id: 'k1max', name: 'K1 Max', default: true }] }
		store.selectedPrinterId = 'k1max'
		store.printerCapabilities = { k1max: { extruders: 1 } } // no build_volume
		expect(store.buildVolume).toEqual([300, 300, 300])
	})

	it('still honours a legacy explicit buildVolume array', () => {
		const store = usePrintStore()
		store.profiles.printers = [{ id: 'x', name: 'x', settings: { buildVolume: [180, 180, 180] } }]
		store.selection.printerId = 'x'
		expect(store.buildVolume).toEqual([180, 180, 180])
	})
})

describe('fitsBed includes the Z (height) axis', () => {
	beforeEach(() => {
		localStorage.clear()
		setActivePinia(createPinia())
	})

	const withK1Max = () => {
		const store = usePrintStore()
		store.profiles.printers = [K1MAX]
		store.selection.printerId = K1MAX.id // 300×300×300
		return store
	}

	it('fits when the footprint AND height are within the bed', () => {
		const store = withK1Max()
		store.setModelMeta({ bbox: { x: 100, y: 100, z: 100 }, triangleCount: 10 })
		expect(store.modelMeta.fitsBed).toBe(true)
	})

	it('does NOT fit when only the height exceeds the build volume', () => {
		const store = withK1Max()
		// footprint fits (100×100) but 350mm tall > 300mm build height
		store.setModelMeta({ bbox: { x: 100, y: 100, z: 350 }, triangleCount: 10 })
		expect(store.modelMeta.fitsBed).toBe(false)
	})

	it('does NOT fit when the footprint exceeds the bed', () => {
		const store = withK1Max()
		store.setModelMeta({ bbox: { x: 400, y: 100, z: 50 }, triangleCount: 10 })
		expect(store.modelMeta.fitsBed).toBe(false)
	})

	it('tolerates a missing z (2D-only bbox) — footprint decides', () => {
		const store = withK1Max()
		store.setModelMeta({ bbox: { x: 100, y: 100 }, triangleCount: 10 })
		expect(store.modelMeta.fitsBed).toBe(true)
	})
})
