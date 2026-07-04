import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@nextcloud/router', () => ({
	generateUrl: (path) => `https://cloud.example${path}`,
}))
vi.mock('@nextcloud/axios', () => ({
	default: { post: vi.fn(), get: vi.fn() },
}))

// print store service mocks (mirror print-monitor.spec.js)
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

import { notifyPrintTransition } from '@/services/events-api.js'
import axios from '@nextcloud/axios'
import { usePrintStore } from '@/store/print.js'

describe('events-api', () => {
	it('posts the transition + context', async () => {
		axios.post.mockResolvedValueOnce({ data: { ok: true, published: true } })
		await notifyPrintTransition({ transition: 'complete', filename: 'benchy.gcode', printer: 'K1', durationS: 8100 })
		expect(axios.post).toHaveBeenCalledWith(
			'https://cloud.example/apps/nc_print/api/events/print-transition',
			{ transition: 'complete', filename: 'benchy.gcode', printer: 'K1', duration_s: 8100 },
		)
	})
})

describe('print store publishes print transitions', () => {
	beforeEach(() => {
		localStorage.clear()
		setActivePinia(createPinia())
		axios.post.mockResolvedValue({ data: { ok: true } })
	})

	it('publishes complete on printing -> complete', () => {
		const store = usePrintStore()
		store.config = { multi_printers: [{ id: 'k1', name: 'K1', default: true }] }
		store.selectedPrinterId = 'k1'
		store.printerState.filename = 'benchy.gcode'
		store.printerState.printDuration = 8100
		store._maybeNotifyPrintTransition('printing', 'complete')
		const call = axios.post.mock.calls.find(c => c[0].endsWith('/api/events/print-transition'))
		expect(call).toBeTruthy()
		expect(call[1]).toMatchObject({ transition: 'complete', filename: 'benchy.gcode', printer: 'K1', duration_s: 8100 })
	})

	it('publishes error on printing -> error', () => {
		const store = usePrintStore()
		store.printerState.filename = 'part.gcode'
		store._maybeNotifyPrintTransition('printing', 'error')
		const call = axios.post.mock.calls.find(c => c[0].endsWith('/api/events/print-transition'))
		expect(call[1]).toMatchObject({ transition: 'error', filename: 'part.gcode' })
	})

	it('does not publish on non-terminal transitions', () => {
		const store = usePrintStore()
		store._maybeNotifyPrintTransition('standby', 'printing')
		const call = axios.post.mock.calls.find(c => c[0].endsWith('/api/events/print-transition'))
		expect(call).toBeUndefined()
	})
})
