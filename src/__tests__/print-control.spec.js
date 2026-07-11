import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@nextcloud/router', () => ({ generateUrl: (p) => `https://cloud.example${p}` }))
vi.mock('@nextcloud/axios', () => ({ default: { post: vi.fn(), get: vi.fn(), delete: vi.fn() } }))
vi.mock('@/services/toast.js', () => ({
	toastError: vi.fn(), toastSuccess: vi.fn(), toastWarning: vi.fn(), toastInfo: vi.fn(),
}))
vi.mock('@/services/slicer-api.js', () => ({
	fetchProfiles: vi.fn(async () => []), sliceStream: vi.fn(), downloadGcode: vi.fn(),
	uploadAndStart: vi.fn(), cancelSliceJob: vi.fn(),
}))
vi.mock('@/services/moonraker-api.js', () => ({
	fetchState: vi.fn(async () => ({})), uploadAndStart: vi.fn(), cameraStreamUrl: vi.fn(() => ''),
	pausePrint: vi.fn(async () => ({})), resumePrint: vi.fn(async () => ({})), cancelPrint: vi.fn(async () => ({})),
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

import { usePrintStore } from '@/store/print.js'
import { pausePrint, resumePrint, cancelPrint, fetchState } from '@/services/moonraker-api.js'
import { toastError } from '@/services/toast.js'

describe('print store shared print controls', () => {
	beforeEach(() => {
		localStorage.clear()
		setActivePinia(createPinia())
		pausePrint.mockClear()
		resumePrint.mockClear()
		cancelPrint.mockClear()
		fetchState.mockClear()
		toastError.mockClear()
	})

	it('printPause/Resume/Cancel call the right api with the active printer id', async () => {
		const store = usePrintStore()
		store.selectedPrinterId = 'k1'
		await store.printPause()
		await store.printResume()
		await store.printCancel()
		expect(pausePrint).toHaveBeenCalledWith('k1')
		expect(resumePrint).toHaveBeenCalledWith('k1')
		expect(cancelPrint).toHaveBeenCalledWith('k1')
	})

	it('toggles printControlBusy around the op and clears it after', async () => {
		const store = usePrintStore()
		expect(store.printControlBusy).toBe(false)
		const p = store.printPause()
		expect(store.printControlBusy).toBe(true)
		await p
		expect(store.printControlBusy).toBe(false)
	})

	it('is re-entrancy guarded: a second call while busy is a no-op', async () => {
		const store = usePrintStore()
		store.printControlBusy = true
		const ok = await store.printResume()
		expect(ok).toBe(false)
		expect(resumePrint).not.toHaveBeenCalled()
	})

	it('toasts + returns false on api failure, and clears busy', async () => {
		const store = usePrintStore()
		cancelPrint.mockRejectedValueOnce(new Error('boom'))
		const ok = await store.printCancel()
		expect(ok).toBe(false)
		expect(toastError).toHaveBeenCalled()
		expect(store.printControlBusy).toBe(false)
	})
})
