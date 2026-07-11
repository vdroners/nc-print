import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/services/toast.js', () => ({
	toastError: vi.fn(),
	toastSuccess: vi.fn(),
	toastWarning: vi.fn(),
	toastInfo: vi.fn(),
}))

vi.mock('@/services/slicer-api.js', () => ({
	fetchProfiles: vi.fn(async () => []),
	sliceStream: vi.fn(),
	downloadGcode: vi.fn(),
	uploadAndStart: vi.fn(),
	cancelSliceJob: vi.fn(),
}))

const consoleCommandMock = vi.fn(async () => ({ ok: true }))
vi.mock('@/services/moonraker-api.js', () => ({
	fetchState: vi.fn(async () => ({})),
	uploadAndStart: vi.fn(),
	cameraStreamUrl: vi.fn(() => ''),
	consoleCommand: (...args) => consoleCommandMock(...args),
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

function read(rel) {
	return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
}

describe('WS11: G-code console', () => {
	beforeEach(() => {
		localStorage.clear()
		setActivePinia(createPinia())
		consoleCommandMock.mockClear()
	})

	// G39a: scrollback appends gcode_response
	it('appends gcode responses to the console log (capped)', () => {
		const store = usePrintStore()
		store.appendConsoleLine('ok', 'response')
		store.appendConsoleLine('T:210 /210', 'response')
		expect(store.consoleLog).toHaveLength(2)
		expect(store.consoleLog[0].text).toBe('ok')
		expect(store.consoleLog[1].kind).toBe('response')
	})

	it('caps the scrollback at 500 lines', () => {
		const store = usePrintStore()
		for (let i = 0; i < 600; i++) {
			store.appendConsoleLine(`line ${i}`)
		}
		expect(store.consoleLog).toHaveLength(500)
		expect(store.consoleLog[499].text).toBe('line 599')
	})

	it('sendConsoleCommand echoes the command then calls the API', async () => {
		const store = usePrintStore()
		await store.sendConsoleCommand('M114')
		expect(store.consoleLog[0].kind).toBe('command')
		expect(store.consoleLog[0].text).toBe('> M114')
		expect(consoleCommandMock).toHaveBeenCalledWith('M114', undefined)
	})

	it('sendConsoleCommand ignores blank input', async () => {
		const store = usePrintStore()
		await store.sendConsoleCommand('   ')
		expect(store.consoleLog).toHaveLength(0)
		expect(consoleCommandMock).not.toHaveBeenCalled()
	})

	it('clearConsoleLog empties the buffer', () => {
		const store = usePrintStore()
		store.appendConsoleLine('ok')
		store.clearConsoleLog()
		expect(store.consoleLog).toHaveLength(0)
	})

	// G39a: send disabled when console_enabled false
	it('consoleEnabled getter mirrors appStatus', () => {
		const store = usePrintStore()
		expect(store.consoleEnabled).toBe(false)
		store.appStatus.console_enabled = true
		expect(store.consoleEnabled).toBe(true)
	})

	it('console panel is gated on consoleEnabled in PrintTab', () => {
		const src = read('../components/PrintTab.vue')
		// The console panel is now a registry entry rendered via <PrintPanel>;
		// its `when` predicate gates visibility on the store's consoleEnabled flag.
		expect(src).toMatch(/comp:\s*'GcodeConsole'/)
		expect(src).toMatch(/when:\s*\(s\)\s*=>\s*s\.consoleEnabled/)
	})

	it('GcodeConsole canSend requires enabled + printable ASCII', () => {
		const src = read('../components/GcodeConsole.vue')
		expect(src).toContain('this.sendEnabled')
		expect(src).toContain('\\x20-\\x7E')
	})

	it('WS client forwards notify_gcode_response to onGcodeResponse', () => {
		const src = read('../services/moonraker-ws.js')
		expect(src).toContain("msg.method === 'notify_gcode_response'")
		expect(src).toContain('this.onGcodeResponse')
	})
})
