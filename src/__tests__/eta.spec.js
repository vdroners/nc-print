import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// --- eta-api (axios-only) ----------------------------------------------------

vi.mock('@nextcloud/router', () => ({
	generateUrl: (path) => `https://cloud.example${path}`,
}))

vi.mock('@nextcloud/axios', () => ({
	default: { post: vi.fn() },
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

import { predictEta, recordEta } from '@/services/eta-api.js'
import axios from '@nextcloud/axios'
import { usePrintStore } from '@/store/print.js'

describe('eta-api', () => {
	it('predictEta posts slicer minutes + context', async () => {
		axios.post.mockResolvedValueOnce({ data: { predicted_minutes: 66, samples: 4 } })
		const res = await predictEta({ slicerMinutes: 60, printerId: 'k1', material: 'PLA', nozzleDiameter: 0.4 })
		expect(res.predicted_minutes).toBe(66)
		expect(axios.post).toHaveBeenCalledWith(
			'https://cloud.example/apps/nc_print/api/eta/predict',
			{ slicer_minutes: 60, printer_id: 'k1', material: 'PLA', nozzle_diameter: 0.4 },
		)
	})

	it('recordEta posts both estimates', async () => {
		axios.post.mockResolvedValueOnce({ data: { ok: true, recorded: true } })
		await recordEta({ slicerMinutes: 60, actualMinutes: 72, printerId: 'k1' })
		expect(axios.post).toHaveBeenCalledWith(
			'https://cloud.example/apps/nc_print/api/eta/record',
			{ slicer_minutes: 60, actual_minutes: 72, printer_id: 'k1', material: '', nozzle_diameter: '' },
		)
	})
})

describe('print store ETA actions', () => {
	beforeEach(() => {
		localStorage.clear()
		setActivePinia(createPinia())
	})

	it('predictEta stores a prediction only when the bucket has samples', async () => {
		const store = usePrintStore()
		store.sliceJob.estimatedTimeS = 3600 // 60 min
		store.selection.printerId = 'k1'
		axios.post.mockResolvedValueOnce({ data: { predicted_minutes: 66, multiplier: 1.1, samples: 4, confidence: 0.4 } })
		await store.predictEta()
		expect(store.etaPrediction).toEqual({ predicted_minutes: 66, multiplier: 1.1, samples: 4, confidence: 0.4 })
	})

	it('predictEta ignores an unlearned bucket (0 samples)', async () => {
		const store = usePrintStore()
		store.sliceJob.estimatedTimeS = 3600
		store.selection.printerId = 'k1'
		axios.post.mockResolvedValueOnce({ data: { predicted_minutes: 60, multiplier: 1, samples: 0, confidence: 0 } })
		await store.predictEta()
		expect(store.etaPrediction).toBeNull()
	})

	it('predictEta no-ops with no slicer estimate', async () => {
		const store = usePrintStore()
		store.sliceJob.estimatedTimeS = 0
		const res = await store.predictEta()
		expect(res).toBeNull()
		expect(axios.post).not.toHaveBeenCalled()
	})

	it('recordEta posts the slicer-vs-actual pair (minutes)', async () => {
		const store = usePrintStore()
		store.sliceJob.estimatedTimeS = 3600 // 60 min
		store.selection.printerId = 'k1'
		axios.post.mockResolvedValueOnce({ data: { ok: true, recorded: true } })
		await store.recordEta(4320) // 72 min actual
		expect(axios.post).toHaveBeenCalledWith(
			'https://cloud.example/apps/nc_print/api/eta/record',
			expect.objectContaining({ slicer_minutes: 60, actual_minutes: 72, printer_id: 'k1' }),
		)
	})

	it('recordEta no-ops without both estimates', async () => {
		const store = usePrintStore()
		store.sliceJob.estimatedTimeS = 0
		const res = await store.recordEta(4320)
		expect(res).toBeNull()
		expect(axios.post).not.toHaveBeenCalled()
	})
})
