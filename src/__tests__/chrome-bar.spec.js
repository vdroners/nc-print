import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { isHealthy, buildRecoveryCards } from '@/utils/service-health.js'

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('chrome bar — health only when broken (G30a)', () => {
	it('healthy status collapses the health banner (empty)', () => {
		expect(isHealthy(
			{ slicer_ok: true, moonraker_ok: true },
			{ has3mfError: false, hasGcodeDownloadError: false },
		)).toBe(true)
	})

	it('slicer offline surfaces a recovery card', () => {
		const status = { loaded: true, slicer_enabled: true, slicer_ok: false, moonraker_enabled: true, moonraker_ok: true }
		expect(isHealthy(status, {})).toBe(false)
		const cards = buildRecoveryCards(status, {})
		expect(cards.map(c => c.kind)).toContain('slicer_offline')
	})

	it('moonraker offline + gcode error stack multiple cards', () => {
		const status = { loaded: true, slicer_enabled: true, slicer_ok: true, moonraker_enabled: true, moonraker_ok: false }
		const cards = buildRecoveryCards(status, { hasGcodeDownloadError: true, gcodeError: 'boom' })
		const kinds = cards.map(c => c.kind)
		expect(kinds).toContain('moonraker_offline')
		expect(kinds).toContain('gcode_download_fail')
	})

	it('suppresses moonraker setup when a target printer is selected', () => {
		const status = {
			loaded: true,
			slicer_enabled: true,
			slicer_ok: true,
			slicer_configured: true,
			moonraker_enabled: true,
			moonraker_configured: false,
			moonraker_ok: false,
		}
		const cards = buildRecoveryCards(status, { selectedPrinterId: 'found:k1' })
		expect(cards.map(c => c.kind)).not.toContain('moonraker_setup')
	})

	it('isHealthy accepts live target printer when global moonraker_ok is false', () => {
		expect(isHealthy(
			{ slicer_ok: true, moonraker_ok: false },
			{ targetPrinterConnected: true },
		)).toBe(true)
	})
})

describe('chrome bar — source contracts (G30b)', () => {
	const banner = read('../components/ServiceHealthBanner.vue')
	const chrome = read('../components/AppChromeBar.vue')
	const app = read('../App.vue')

	it('ServiceHealthBanner no longer renders the compact "connected" OK strip', () => {
		expect(banner).not.toMatch(/nc-print-health-banner--ok/)
		expect(banner).not.toMatch(/v-else-if/)
	})

	it('AppChromeBar hosts the notification bell wired to requestPrintNotifications', () => {
		expect(chrome).toMatch(/requestPrintNotifications/)
		expect(chrome).toMatch(/nc-print-chrome-bar__bell/)
	})

	it('App.vue mounts a single AppChromeBar inside the chrome region', () => {
		expect(app).toMatch(/<AppChromeBar\s*\/>/)
		expect(app).not.toMatch(/<ServiceHealthBanner/)
	})
})
