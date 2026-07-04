/**
 * @vitest-environment node
 * Reads css/style.scss off disk via import.meta.url — needs the node env
 * (happy-dom resolves import.meta.url to an http URL, breaking fileURLToPath).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { BREAKPOINTS } from '@/utils/workflow-gates.js'

const styleScss = readFileSync(
	fileURLToPath(new URL('../../css/style.scss', import.meta.url)),
	'utf8',
)

describe('layout cohesion (G28)', () => {
	it('exposes unified 1200/900 breakpoints', () => {
		expect(BREAKPOINTS.multiColumn).toBe(1200)
		expect(BREAKPOINTS.singleColumn).toBe(900)
	})

	it('does not force overflow:hidden on the nc_print shell body', () => {
		// The single-body-scroll fix removed the override; the shell body owns
		// the y-scroll (flex:1; overflow:auto) from nc-print-theme.css.
		const bodyRule = styleScss.match(
			/\.nc-gcs-app-shell--nc_print \.nc-gcs-app-shell__body \{([^}]*)\}/,
		)
		expect(bodyRule).not.toBeNull()
		expect(bodyRule[1]).not.toMatch(/overflow:\s*hidden/)
	})

	it('makes the chrome bar sticky', () => {
		const chromeRule = styleScss.match(/\.nc-print-chrome \{([^}]*)\}/)
		expect(chromeRule).not.toBeNull()
		expect(chromeRule[1]).toMatch(/position:\s*sticky/)
	})

	it('no longer ships the floating CameraPip absolute rule', () => {
		expect(styleScss).not.toMatch(/\.nc-print-camera-pip\b/)
	})
})
