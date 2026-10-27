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
	fetchState: vi.fn(async () => ({})),
	uploadAndStart: vi.fn(),
	cameraStreamUrl: vi.fn(() => ''),
	pausePrint: vi.fn(async () => ({})),
	resumePrint: vi.fn(async () => ({})),
	cancelPrint: vi.fn(async () => ({})),
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
import { TABS } from '@/constants/tabs.js'
import { uploadAndStart } from '@/services/moonraker-api.js'
import { pausePrint, resumePrint, cancelPrint } from '@/services/moonraker-api.js'
import { TIMEOUT_MESSAGE } from '@/utils/gcode-transfer-error.js'

const timeoutBody = {
	response: {
		status: 502,
		data: {
			error: 'moonraker_timeout',
			failure: 'timeout',
			message: TIMEOUT_MESSAGE,
			retryable: true,
		},
	},
}

describe('gcode upload and send retry', () => {
	beforeEach(() => {
		localStorage.clear()
		setActivePinia(createPinia())
		uploadAndStart.mockReset()
		pausePrint.mockReset()
		resumePrint.mockReset()
		cancelPrint.mockReset()
	})

	it('records a send timeout and does not post again until Retry', async () => {
		uploadAndStart.mockRejectedValueOnce(timeoutBody)
		const store = usePrintStore()
		store.selectedPrinterId = 'k1'
		store.activeTab = TABS.SLICE
		const file = new File(['G1 X0'], 'job.gcode', { type: 'text/plain' })

		const ok = await store.sendGcodeToPrinter(file, 'job.gcode', true)

		expect(ok).toBe(false)
		expect(uploadAndStart).toHaveBeenCalledTimes(1)
		expect(uploadAndStart).toHaveBeenCalledWith(file, 'job.gcode', true, 'k1')
		expect(store.gcodeTransfer.error.kind).toBe('timeout')
		expect(store.gcodeTransfer.error.message).toMatch(/second job/)
		expect(store.gcodeTransfer.source).toBe('send')
		expect(store.gcodeTransfer.busy).toBe(false)
		expect(store.sliceJob.printing).not.toBe(true)
		expect(store.activeTab).toBe(TABS.SLICE)
		expect(pausePrint).not.toHaveBeenCalled()
		expect(cancelPrint).not.toHaveBeenCalled()
	})

	it('retries a failed upload once when asked, then clears the error', async () => {
		uploadAndStart
			.mockRejectedValueOnce({ code: 'ECONNRESET', message: 'socket hang up' })
			.mockResolvedValueOnce({ result: 'ok' })
		const store = usePrintStore()
		store.selectedPrinterId = 'k1'
		const file = new File(['G1 X0'], 'plate.gcode', { type: 'text/plain' })

		expect(await store.uploadLocalGcode(file, false)).toBe(false)
		expect(uploadAndStart).toHaveBeenCalledTimes(1)
		expect(store.gcodeTransfer.error.kind).toBe('unreachable')
		expect(store.gcodeTransfer.error.message).not.toMatch(/second job/)
		expect(store.gcodeTransfer.source).toBe('upload')

		expect(await store.retryLastGcodeTransfer()).toBe(true)
		expect(uploadAndStart).toHaveBeenCalledTimes(2)
		expect(uploadAndStart).toHaveBeenLastCalledWith(file, 'plate.gcode', false, 'k1')
		expect(store.gcodeTransfer.error).toBe(null)
		expect(store.gcodeTransfer.payload).toBe(null)
	})

	it('ignores a second upload while the first is still in flight', async () => {
		let release
		uploadAndStart.mockImplementation(() => new Promise((resolve) => {
			release = resolve
		}))
		const store = usePrintStore()
		const file = new File(['G1'], 'job.gcode', { type: 'text/plain' })
		const first = store.uploadLocalGcode(file, false)
		expect(store.gcodeTransfer.busy).toBe(true)

		expect(await store.retryLastGcodeTransfer()).toBe(false)
		expect(await store.uploadLocalGcode(file, true)).toBe(false)
		expect(uploadAndStart).toHaveBeenCalledTimes(1)

		release({ result: 'ok' })
		expect(await first).toBe(true)
		expect(uploadAndStart).toHaveBeenCalledTimes(1)
	})

	it('pause, resume, and cancel each fire once when the hop fails', async () => {
		pausePrint.mockRejectedValue(new Error('timeout of 60000ms exceeded'))
		resumePrint.mockRejectedValue(new Error('Connection reset by peer'))
		cancelPrint.mockRejectedValue(new Error('network error'))
		const store = usePrintStore()

		expect(await store.printPause()).toBe(false)
		expect(await store.printResume()).toBe(false)
		expect(await store.printCancel()).toBe(false)

		expect(pausePrint).toHaveBeenCalledTimes(1)
		expect(resumePrint).toHaveBeenCalledTimes(1)
		expect(cancelPrint).toHaveBeenCalledTimes(1)
		expect(uploadAndStart).not.toHaveBeenCalled()
		expect(store.gcodeTransfer.error).toBe(null)
	})
})
