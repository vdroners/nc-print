import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const styleScss = read('../../css/style.scss')
const workspaceRail = read('../components/WorkspaceRail.vue')
const statusBar = read('../components/PrintStatusBar.vue')

describe('spacing & clipping cleanup (G37a)', () => {
	it('caps and centers the scrolling content on wide displays', () => {
		const rule = styleScss.match(/\.nc-print-tab-scroll \{([^}]*)\}/)
		expect(rule).not.toBeNull()
		expect(rule[1]).toMatch(/margin-inline:\s*auto/)
		expect(rule[1]).toMatch(/max-width:\s*min\(1680px/)
	})

	it('offsets the sticky rail below the chrome bar', () => {
		expect(workspaceRail).toMatch(/top:\s*var\(--nc-print-chrome-h/)
	})

	it('workflow subtitle no longer hard-clips with white-space:nowrap', () => {
		const rule = styleScss.match(/\.nc-print-workflow__sub \{([^}]*)\}/)
		expect(rule).not.toBeNull()
		expect(rule[1]).not.toMatch(/white-space:\s*nowrap/)
	})

	it('print status bar sticks BELOW the chrome bar (no clipping) and under its z-index', () => {
		const rule = statusBar.match(/\.nc-print-statusbar \{([^}]*)\}/)
		expect(rule).not.toBeNull()
		// top offset = chrome height (not top:0), like WorkspaceRail
		expect(rule[1]).toMatch(/top:\s*var\(--nc-print-chrome-h/)
		// z-index below the chrome's 3 (was 20, which caused the overlap).
		// Match the declaration (ends with ;), not the "z-index:3" in a comment.
		const z = rule[1].match(/z-index:\s*(\d+)\s*;/)
		expect(z).not.toBeNull()
		expect(Number(z[1])).toBeLessThan(3)
	})

	it('print status bar drops the redundant full-width progress bar (control card owns it)', () => {
		expect(statusBar).not.toMatch(/nc-print-statusbar__bar\b/)
		expect(statusBar).not.toMatch(/nc-print-statusbar__fill\b/)
	})
})

describe('clipping audit (G37b)', () => {
	it('removed the floating camera-pip and the shell-body overflow clip', () => {
		// camera-pip rule fully gone
		expect(styleScss).not.toMatch(/\.nc-print-camera-pip\b/)
		// shell body no longer forces overflow:hidden
		const bodyRule = styleScss.match(
			/\.nc-gcs-app-shell--nc_print \.nc-gcs-app-shell__body \{([^}]*)\}/,
		)
		expect(bodyRule[1]).not.toMatch(/overflow:\s*hidden/)
	})

	it('tab-scroll is demoted to a plain wrapper (body owns the scroll)', () => {
		const rule = styleScss.match(/\.nc-print-tab-scroll \{([^}]*)\}/)
		expect(rule[1]).not.toMatch(/overflow-y:\s*auto/)
	})
})
