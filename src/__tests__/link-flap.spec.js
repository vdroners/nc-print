import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { setActivePinia, createPinia } from 'pinia'
import {
	LINK_FLAP_BANNER_TEXT,
	LINK_FLAP_DEFAULTS,
	createLinkFlapTracker,
	formatLastSuccess,
	linkFlapDetail,
} from '@/utils/link-flap.js'

vi.mock('@/services/toast.js', () => ({
	toastError: vi.fn(),
	toastSuccess: vi.fn(),
	toastWarning: vi.fn(),
	toastInfo: vi.fn(),
}))

vi.mock('@/services/slicer-api.js', () => ({
	fetchProfiles: vi.fn(async () => []),
	fetchProfileSettings: vi.fn(async () => ({})),
	sliceStream: vi.fn(),
	sliceStreamMulti: vi.fn(),
	downloadGcode: vi.fn(),
	uploadAndStart: vi.fn(),
	cancelSliceJob: vi.fn(),
}))

vi.mock('@/services/moonraker-api.js', () => ({
	fetchState: vi.fn(async () => ({})),
	uploadAndStart: vi.fn(),
	pausePrint: vi.fn(),
	resumePrint: vi.fn(),
	cancelPrint: vi.fn(),
}))

vi.mock('@/services/config-api.js', () => ({
	fetchConfig: vi.fn(async () => ({})),
}))

vi.mock('@/services/status-api.js', () => ({
	fetchAppStatus: vi.fn(async () => ({})),
}))

vi.mock('@/services/files-api.js', () => ({
	fetchModelBlob: vi.fn(),
	resolveFile: vi.fn(),
}))

vi.mock('@/services/gcode-save-api.js', () => ({
	saveGcodeToFiles: vi.fn(),
}))

vi.mock('@/services/moonraker-ws.js', () => ({
	MoonrakerWsClient: vi.fn(),
}))

import { fetchState } from '@/services/moonraker-api.js'
import { usePrintStore } from '@/store/print.js'

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

const T0 = Date.parse('2026-10-27T00:00:00.000Z')

function at(ms) {
	vi.setSystemTime(T0 + ms)
}

describe('link flap tracker', () => {
	it('uses the lab thresholds', () => {
		expect(LINK_FLAP_DEFAULTS).toEqual({
			windowMs: 120_000,
			briefOfflineMs: 30_000,
			minDisconnects: 2,
			stableMs: 60_000,
		})
	})

	it('stays quiet for a single drop and for repeated samples while already down', () => {
		const tracker = createLinkFlapTracker()
		tracker.note(true, 0)
		tracker.note(false, 1_000)
		tracker.note(false, 4_000)
		const snap = tracker.note(false, 8_000)
		expect(snap.recentDisconnects).toBe(1)
		expect(snap.visible).toBe(false)
		expect(snap.lastSuccessAgeMs).toBe(8_000)
	})

	it('shows on the second brief drop, including while that drop is still open', () => {
		const tracker = createLinkFlapTracker()
		tracker.note(true, 0)
		tracker.note(false, 1_000)
		tracker.note(true, 5_000)
		const snap = tracker.note(false, 8_000)
		expect(snap.recentDisconnects).toBe(2)
		expect(snap.visible).toBe(true)
		expect(snap.flapping).toBe(true)
		expect(snap.episode).toBe(1)
	})

	it('treats a drop that stays down longer than 30s as an outage', () => {
		const tracker = createLinkFlapTracker()
		tracker.note(true, 0)
		tracker.note(false, 1_000)
		expect(tracker.tick(1_000 + 30_000).recentDisconnects).toBe(1)
		const snap = tracker.tick(1_000 + 30_001)
		expect(snap.recentDisconnects).toBe(0)
		expect(snap.visible).toBe(false)
	})

	it('keeps a recovery at exactly 30s and retracts one that returns later', () => {
		const tracker = createLinkFlapTracker()
		tracker.note(true, 0)
		tracker.note(false, 1_000)
		expect(tracker.note(true, 31_000).recentDisconnects).toBe(1)

		const late = createLinkFlapTracker()
		late.note(true, 0)
		late.note(false, 1_000)
		expect(late.note(true, 31_001).recentDisconnects).toBe(0)
	})

	it('does not count an offline spell that started before the first success', () => {
		const tracker = createLinkFlapTracker()
		tracker.note(false, 0)
		tracker.note(false, 10_000)
		const snap = tracker.note(true, 12_000)
		expect(snap.recentDisconnects).toBe(0)
		expect(snap.visible).toBe(false)
	})

	it('clears after 60s continuously online', () => {
		const tracker = createLinkFlapTracker()
		tracker.note(true, 0)
		tracker.note(false, 1_000)
		tracker.note(true, 2_000)
		tracker.note(false, 3_000)
		const back = tracker.note(true, 4_000)
		expect(back.visible).toBe(true)
		expect(tracker.note(true, 4_000 + 59_999).visible).toBe(true)
		const cleared = tracker.note(true, 4_000 + 60_000)
		expect(cleared.visible).toBe(false)
		expect(cleared.flapping).toBe(false)
		expect(cleared.recentDisconnects).toBe(0)
	})

	it('ages drops out of the two-minute window while the link stays down', () => {
		const tracker = createLinkFlapTracker()
		tracker.note(true, 0)
		tracker.note(false, 1_000)
		tracker.note(true, 2_000)
		tracker.note(false, 3_000)
		tracker.note(true, 4_000)
		tracker.note(false, 5_000)
		const retracted = tracker.tick(5_000 + 30_001)
		expect(retracted.recentDisconnects).toBe(2)
		expect(retracted.visible).toBe(true)
		const oneLeft = tracker.tick(1_000 + 120_001)
		expect(oneLeft.recentDisconnects).toBe(1)
		expect(oneLeft.visible).toBe(false)
		expect(tracker.tick(3_000 + 120_001).recentDisconnects).toBe(0)
	})

	it('dismiss hides the episode until the link stabilizes and flaps again', () => {
		const tracker = createLinkFlapTracker()
		tracker.note(true, 0)
		tracker.note(false, 1_000)
		tracker.note(true, 2_000)
		tracker.note(false, 3_000)
		expect(tracker.snapshot(3_000).visible).toBe(true)

		expect(tracker.dismiss(3_000).visible).toBe(false)
		// Same episode: recover and drop again — dismiss still holds.
		tracker.note(true, 6_000)
		tracker.note(false, 8_000)
		expect(tracker.snapshot(8_000).visible).toBe(false)
		expect(tracker.snapshot(8_000).episode).toBe(1)

		// A full stable minute ends the episode. The next pair is a new one.
		tracker.note(true, 10_000)
		const stable = tracker.note(true, 10_000 + 60_000)
		expect(stable.flapping).toBe(false)
		expect(stable.recentDisconnects).toBe(0)
		tracker.note(false, 80_000)
		tracker.note(true, 81_000)
		const again = tracker.note(false, 82_000)
		expect(again.visible).toBe(true)
		expect(again.episode).toBe(2)
	})

	it('reset drops history so the next printer starts clean', () => {
		const tracker = createLinkFlapTracker()
		tracker.note(true, 0)
		tracker.note(false, 1_000)
		tracker.note(true, 2_000)
		tracker.note(false, 3_000)
		tracker.reset()
		tracker.note(true, 4_000)
		const snap = tracker.note(false, 5_000)
		expect(snap.visible).toBe(false)
		expect(snap.recentDisconnects).toBe(1)
		expect(snap.episode).toBe(0)
	})
})

describe('link flap copy', () => {
	it('headline names the hop', () => {
		expect(LINK_FLAP_BANNER_TEXT).toBe('Printer Wi‑Fi weak — status may flap')
	})

	it('detail counts brief drops and the age of the last success', () => {
		expect(formatLastSuccess(500)).toBe('last status just now')
		expect(formatLastSuccess(4_000)).toBe('last status 4s ago')
		expect(formatLastSuccess(60_000)).toBe('last status 1m ago')
		expect(formatLastSuccess(120_000)).toBe('last status 2m ago')
		expect(linkFlapDetail({ recentDisconnects: 2, lastSuccessAgeMs: 4_000 }))
			.toBe('2 brief drops · last status 4s ago')
		expect(linkFlapDetail({ recentDisconnects: 1, lastSuccessAgeMs: null }))
			.toBe('1 brief drop')
	})
})

describe('print store link flap', () => {
	beforeEach(() => {
		localStorage.clear()
		setActivePinia(createPinia())
		vi.useFakeTimers({ toFake: ['Date'] })
		at(0)
		fetchState.mockReset()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it('flags a websocket reconnect flap and dismisses that episode', () => {
		const store = usePrintStore()
		store._applyPrinterState({ connected: true, state: 'ready' })
		at(1_000)
		store._applyPrinterState({ connected: false, state: 'reconnecting', lastError: 'Reconnecting to printer…' })
		at(4_000)
		store._applyPrinterState({ connected: true, state: 'ready' })
		at(6_000)
		store._applyPrinterState({ connected: false, state: 'reconnecting', lastError: 'Reconnecting to printer…' })

		expect(store.linkFlap.visible).toBe(true)
		expect(store.linkFlap.recentDisconnects).toBe(2)
		expect(store.printerState.connected).toBe(false)
		expect(linkFlapDetail(store.linkFlap)).toBe('2 brief drops · last status 2s ago')

		store.dismissLinkFlap()
		expect(store.linkFlap.visible).toBe(false)
		expect(store.linkFlap.flapping).toBe(true)
	})

	it('counts poll failures, not every failed poll, and clears after a stable minute', async () => {
		const store = usePrintStore()
		store.selectedPrinterId = 'found:k1'

		fetchState.mockResolvedValueOnce({ connected: true, state: 'standby' })
		await store.refreshPrinterState()
		at(1_000)
		fetchState.mockRejectedValueOnce(new Error('timeout'))
		await store.refreshPrinterState()
		at(2_000)
		fetchState.mockRejectedValueOnce(new Error('timeout'))
		await store.refreshPrinterState()
		expect(store.linkFlap.recentDisconnects).toBe(1)
		expect(store.linkFlap.visible).toBe(false)

		at(5_000)
		fetchState.mockResolvedValueOnce({ connected: true, state: 'standby' })
		await store.refreshPrinterState()
		at(7_000)
		fetchState.mockRejectedValueOnce(new Error('timeout'))
		await store.refreshPrinterState()
		expect(store.linkFlap.visible).toBe(true)
		expect(store.linkFlap.recentDisconnects).toBe(2)

		at(7_000 + 4_000)
		fetchState.mockResolvedValueOnce({ connected: true, state: 'standby' })
		await store.refreshPrinterState()
		at(11_000 + 60_000)
		fetchState.mockResolvedValueOnce({ connected: true, state: 'standby' })
		await store.refreshPrinterState()
		expect(store.linkFlap.visible).toBe(false)
		expect(store.linkFlap.recentDisconnects).toBe(0)
	})

	it('clears flap history when the printer state is reset', () => {
		const store = usePrintStore()
		store._applyPrinterState({ connected: true, state: 'ready' })
		at(1_000)
		store._applyPrinterState({ connected: false, state: 'offline' })
		at(2_000)
		store._applyPrinterState({ connected: true, state: 'ready' })
		at(3_000)
		store._applyPrinterState({ connected: false, state: 'offline' })
		expect(store.linkFlap.visible).toBe(true)

		store._resetPrinterState()
		expect(store.linkFlap.visible).toBe(false)
		expect(store.linkFlap.recentDisconnects).toBe(0)

		at(4_000)
		store._applyPrinterState({ connected: true, state: 'ready' })
		at(5_000)
		store._applyPrinterState({ connected: false, state: 'offline' })
		expect(store.linkFlap.visible).toBe(false)
		expect(store.linkFlap.recentDisconnects).toBe(1)
	})
})

describe('link flap banner source', () => {
	const banner = read('../components/LinkFlapBanner.vue')
	const chrome = read('../components/AppChromeBar.vue')

	it('mounts a dismissible status banner in the chrome', () => {
		expect(banner).toContain('LINK_FLAP_BANNER_TEXT')
		expect(banner).toContain('role="status"')
		expect(banner).toContain('aria-live="polite"')
		expect(banner).toContain('linkFlapDetail')
		expect(banner).toContain('dismissLinkFlap')
		expect(banner).toMatch(/>\s*Dismiss\s*</)
		expect(banner).toContain('nc-print-link-flap')
		expect(banner).toContain('--nc-gcs-warning')
		expect(banner).not.toContain('aria-modal')
		expect(banner).not.toMatch(/position:\s*fixed/)
		expect(chrome).toContain('<LinkFlapBanner')
	})
})
