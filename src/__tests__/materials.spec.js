import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// --- materials-api (axios-only) ---------------------------------------------

vi.mock('@nextcloud/router', () => ({
	generateUrl: (path) => `https://cloud.example${path}`,
}))

vi.mock('@nextcloud/axios', () => ({
	default: { get: vi.fn() },
}))

// --- print store service mocks (mirror print-monitor.spec.js) ---------------

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

import { fetchMaterials, fetchMaterial } from '@/services/materials-api.js'
import axios from '@nextcloud/axios'
import { usePrintStore } from '@/store/print.js'

describe('materials-api', () => {
	it('fetchMaterials returns the materials array', async () => {
		axios.get.mockResolvedValueOnce({ data: { materials: [{ id: 'pla' }], count: 1 } })
		expect(await fetchMaterials()).toEqual([{ id: 'pla' }])
	})

	it('fetchMaterials passes a category filter in the query', async () => {
		axios.get.mockResolvedValueOnce({ data: { materials: [], count: 0 } })
		await fetchMaterials('composite')
		expect(axios.get).toHaveBeenCalledWith(
			'https://cloud.example/apps/nc_print/api/slicer/materials?category=composite',
		)
	})

	it('fetchMaterial fetches a single entry by id', async () => {
		axios.get.mockResolvedValueOnce({ data: { id: 'pa-cf' } })
		expect((await fetchMaterial('pa-cf')).id).toBe('pa-cf')
		expect(axios.get).toHaveBeenCalledWith(
			'https://cloud.example/apps/nc_print/api/slicer/materials/pa-cf',
		)
	})
})

describe('print store applyMaterialTemps', () => {
	beforeEach(() => {
		localStorage.clear()
		setActivePinia(createPinia())
	})

	it('seeds nozzle/bed overrides from a material and expands the section', () => {
		const store = usePrintStore()
		store.overridesCollapsed = true
		const ok = store.applyMaterialTemps({
			nozzle_temp: { recommended: 240 },
			bed_temp: { recommended: 70 },
		})
		expect(ok).toBe(true)
		expect(store.overrides.nozzleTemp).toBe(240)
		expect(store.overrides.bedTemp).toBe(70)
		expect(store.overridesCollapsed).toBe(false)
	})

	it('returns false and changes nothing for a material with no temps', () => {
		const store = usePrintStore()
		store.overrides.nozzleTemp = ''
		expect(store.applyMaterialTemps({})).toBe(false)
		expect(store.applyMaterialTemps(null)).toBe(false)
		expect(store.overrides.nozzleTemp).toBe('')
	})
})
