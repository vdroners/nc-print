import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@nextcloud/router', () => ({ generateUrl: (p) => `https://cloud.example${p}` }))
vi.mock('@nextcloud/axios', () => ({ default: { post: vi.fn(), get: vi.fn() } }))
vi.mock('@/services/toast.js', () => ({
	toastError: vi.fn(), toastSuccess: vi.fn(), toastWarning: vi.fn(), toastInfo: vi.fn(),
}))
// Mock slicer-api so we can drive fetchProfileSettings.
const fetchProfileSettingsMock = vi.fn()
vi.mock('@/services/slicer-api.js', () => ({
	fetchProfiles: vi.fn(async () => []),
	fetchProfileSettings: (...a) => fetchProfileSettingsMock(...a),
	sliceStream: vi.fn(), sliceStreamMulti: vi.fn(), downloadGcode: vi.fn(),
	uploadAndStart: vi.fn(), cancelSliceJob: vi.fn(),
}))
vi.mock('@/services/moonraker-api.js', () => ({ fetchState: vi.fn(async () => ({})), uploadAndStart: vi.fn() }))
vi.mock('@/services/config-api.js', () => ({ fetchConfig: vi.fn(async () => ({})) }))
vi.mock('@/services/status-api.js', () => ({ fetchAppStatus: vi.fn(async () => ({})) }))
vi.mock('@/services/files-api.js', () => ({ fetchModelBlob: vi.fn(), resolveFile: vi.fn() }))
vi.mock('@/services/gcode-save-api.js', () => ({ saveGcodeToFiles: vi.fn() }))
vi.mock('@/services/moonraker-ws.js', () => ({ MoonrakerWsClient: vi.fn() }))
vi.mock('@/services/mesh-convert.js', async (o) => {
	const a = await o()
	return { ...a, convert3mfToStlBuffer: vi.fn(), list3mfBuildItems: vi.fn(async () => []) }
})

import { usePrintStore } from '@/store/print.js'

describe('hydrateSelectedSettings (slim-profiles support)', () => {
	beforeEach(() => {
		localStorage.clear()
		setActivePinia(createPinia())
		fetchProfileSettingsMock.mockReset()
	})

	it('fetches + stamps settings_json onto the selected trio (slim rows lack it)', async () => {
		const store = usePrintStore()
		store.profiles.printers = [{ id: 'K1 Max', name: 'K1 Max', kind: 'printer' }]
		store.profiles.filaments = [{ id: 'PLA', name: 'PLA', kind: 'filament' }]
		store.profiles.processes = [{ id: 'std', name: 'std', kind: 'process' }]
		store.selection = { printerId: 'K1 Max', filamentId: 'PLA', processId: 'std' }
		fetchProfileSettingsMock.mockImplementation(async (kind) => ({ __k: kind }))

		await store.hydrateSelectedSettings()

		expect(fetchProfileSettingsMock).toHaveBeenCalledTimes(3)
		expect(store.profiles.printers[0].settings_json).toEqual({ __k: 'printer' })
		expect(store.profiles.filaments[0].settings_json).toEqual({ __k: 'filament' })
		expect(store.profiles.processes[0].settings_json).toEqual({ __k: 'process' })
	})

	it('skips rows already hydrated (idempotent)', async () => {
		const store = usePrintStore()
		store.profiles.printers = [{ id: 'K1', name: 'K1', kind: 'printer', settings_json: { done: 1 } }]
		store.selection = { printerId: 'K1', filamentId: '', processId: '' }
		await store.hydrateSelectedSettings()
		expect(fetchProfileSettingsMock).not.toHaveBeenCalled()
	})

	it('leaves the row unhydrated when the fetch returns empty (best-effort)', async () => {
		const store = usePrintStore()
		store.profiles.filaments = [{ id: 'PLA', name: 'PLA', kind: 'filament' }]
		store.selection = { printerId: '', filamentId: 'PLA', processId: '' }
		fetchProfileSettingsMock.mockResolvedValue({})
		await store.hydrateSelectedSettings()
		expect(store.profiles.filaments[0].settings_json).toBeUndefined()
	})
})

describe('_validateProfileSelection (self-heal stale/removed profiles)', () => {
	beforeEach(() => {
		localStorage.clear()
		setActivePinia(createPinia())
	})

	it('re-picks a real printer when the saved one is gone (e.g. Default Printer)', () => {
		const store = usePrintStore()
		store.profiles.printers = [
			{ id: 'Creality K1 Max (0.4 nozzle)', name: 'Creality K1 Max (0.4 nozzle)', kind: 'printer', is_default: true },
		]
		store.profiles.filaments = [{ id: 'Generic PLA', name: 'Generic PLA', kind: 'filament', is_default: true }]
		store.profiles.processes = [{ id: 'std', name: 'std', kind: 'process', is_default: true }]
		// Stale selection that no longer exists in the (filtered) lists.
		store.selection = { printerId: 'Default Printer', filamentId: 'ghost', processId: 'std' }

		store._validateProfileSelection()

		expect(store.selection.printerId).toBe('Creality K1 Max (0.4 nozzle)')
		expect(store.selection.filamentId).toBe('Generic PLA')
		expect(store.selection.processId).toBe('std') // still valid → untouched
	})

	it('leaves a valid selection untouched', () => {
		const store = usePrintStore()
		store.profiles.printers = [{ id: 'p1', name: 'p1', kind: 'printer' }]
		store.profiles.filaments = [{ id: 'f1', name: 'f1', kind: 'filament' }]
		store.profiles.processes = [{ id: 'q1', name: 'q1', kind: 'process' }]
		store.selection = { printerId: 'p1', filamentId: 'f1', processId: 'q1' }
		store._validateProfileSelection()
		expect(store.selection).toEqual({ printerId: 'p1', filamentId: 'f1', processId: 'q1' })
	})
})
