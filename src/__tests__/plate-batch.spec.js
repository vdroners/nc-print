import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@nextcloud/router', () => ({ generateUrl: (p) => `https://cloud.example${p}` }))
vi.mock('@nextcloud/axios', () => ({ default: { post: vi.fn(), get: vi.fn() } }))
vi.mock('@/services/toast.js', () => ({
	toastError: vi.fn(), toastSuccess: vi.fn(), toastWarning: vi.fn(), toastInfo: vi.fn(),
}))
// downloadGcode is the one slicer-api fn the plate batch uses.
const downloadGcodeMock = vi.fn(async () => new Blob([new Uint8Array(10)]))
vi.mock('@/services/slicer-api.js', () => ({
	fetchProfiles: vi.fn(async () => []), sliceStream: vi.fn(), sliceStreamMulti: vi.fn(),
	downloadGcode: (...a) => downloadGcodeMock(...a), uploadAndStart: vi.fn(), cancelSliceJob: vi.fn(),
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

describe('multi-plate slice batch (4d)', () => {
	beforeEach(() => {
		localStorage.clear()
		setActivePinia(createPinia())
		downloadGcodeMock.mockClear()
		downloadGcodeMock.mockResolvedValue(new Blob([new Uint8Array(10)]))
	})

	it('startPlateBatch resets the plates array and marks running', () => {
		const store = usePrintStore()
		store.sliceJob.plates = [{ index: 9 }]
		store.startPlateBatch()
		expect(store.sliceJob.plates).toEqual([])
		expect(store.sliceJob.status).toBe('running')
	})

	it('applyPlateSliceResult accumulates one entry per plate and downloads gcode', async () => {
		const store = usePrintStore()
		store.startPlateBatch()
		await store.applyPlateSliceResult({ job_id: 'j1', estimated_time_s: 100, filament_used_g: [12] }, { index: 0 })
		await store.applyPlateSliceResult({ job_id: 'j2', estimated_time_s: 200, filament_used_g: [8, 4] }, { index: 1 })
		expect(store.sliceJob.plates).toHaveLength(2)
		expect(store.sliceJob.plates[0].jobId).toBe('j1')
		expect(store.sliceJob.plates[0].estimatedTimeS).toBe(100)
		expect(store.sliceJob.plates[1].filamentUsedG).toBe(12) // 8 + 4
		expect(store.sliceJob.plates[0].gcodeBlob).toBeInstanceOf(Blob)
		expect(downloadGcodeMock).toHaveBeenCalledTimes(2)
	})

	it('names each plate gcode distinctly from the model stem', async () => {
		const store = usePrintStore()
		store.model.name = 'widget.stl'
		store.startPlateBatch()
		await store.applyPlateSliceResult({ job_id: 'j1' }, { index: 0 })
		await store.applyPlateSliceResult({ job_id: 'j2' }, { index: 1 })
		expect(store.sliceJob.plates[0].gcodeFilename).toBe('widget-plate1.gcode')
		expect(store.sliceJob.plates[1].gcodeFilename).toBe('widget-plate2.gcode')
	})

	it('records a per-plate error when gcode download fails (batch continues)', async () => {
		const store = usePrintStore()
		store.startPlateBatch()
		downloadGcodeMock.mockRejectedValueOnce(new Error('nope'))
		await store.applyPlateSliceResult({ job_id: 'j1' }, { index: 0 })
		expect(store.sliceJob.plates[0].error).toBeTruthy()
		expect(store.sliceJob.plates[0].gcodeBlob).toBeNull()
	})

	it('finishPlateBatch marks the job done', () => {
		const store = usePrintStore()
		store.startPlateBatch()
		store.sliceJob.plates = [{ gcodeBlob: new Blob() }, { gcodeBlob: new Blob() }]
		store.finishPlateBatch()
		expect(store.sliceJob.status).toBe('done')
	})
})
