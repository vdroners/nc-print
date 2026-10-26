import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const styleScss = read('../../css/style.scss')
const themeCss = read('../../css/nc-print-theme.css')
const workspaceRail = read('../components/WorkspaceRail.vue')
const statusBar = read('../components/PrintStatusBar.vue')
const commands = read('../utils/commands.js')
const chromeBar = read('../components/AppChromeBar.vue')
const overview = read('../components/OverviewTab.vue')

describe('spacing & clipping cleanup (G37a + 4K density)', () => {
	it('exposes --nc-print-content-max and side/rail tokens in the theme', () => {
		expect(themeCss).toMatch(/--nc-print-content-max:\s*1680px/)
		expect(themeCss).toMatch(/--nc-print-side-left:/)
		expect(themeCss).toMatch(/--nc-print-side-right:/)
		expect(themeCss).toMatch(/--nc-print-print-rail-min:/)
	})

	it('caps and centers scrolling content via the content-max token', () => {
		const rule = styleScss.match(/\.nc-print-tab-scroll \{([^}]*)\}/)
		expect(rule).not.toBeNull()
		expect(rule[1]).toMatch(/margin-inline:\s*auto/)
		expect(rule[1]).toMatch(/max-width:\s*var\(--nc-print-content-max/)
		expect(styleScss).toMatch(/\.nc-print-chrome > \* \{[\s\S]*?max-width:\s*var\(--nc-print-content-max/)
	})

	it('raises content-max at 1920 / 2560 / 3200 for Ultrawide density', () => {
		expect(styleScss).toMatch(/@media \(min-width:\s*1920px\)/)
		expect(styleScss).toMatch(/min\(2400px,\s*92vw\)/)
		expect(styleScss).toMatch(/@media \(min-width:\s*2560px\)/)
		expect(styleScss).toMatch(/min\(2880px,\s*94vw\)/)
		expect(styleScss).toMatch(/@media \(min-width:\s*3200px\)/)
		expect(styleScss).toMatch(/min\(3200px,\s*96vw\)/)
		expect(styleScss).toMatch(/#nc-print-root\[data-density='comfortable'\]/)
		expect(styleScss).toMatch(/#nc-print-root:not\(\[data-density='comfortable'\]\)/)
	})

	it('widens the workflow banner under Ultrawide ≥1920', () => {
		expect(styleScss).toMatch(
			/#nc-print-root:not\(\[data-density='comfortable'\]\) \.nc-print-workflow__list \{[\s\S]*?max-width:\s*min\(96vw,\s*820px\)/,
		)
	})

	it('Print WorkspaceRail hero grid at ≥1600 uses a ≥420px side', () => {
		expect(workspaceRail).toMatch(/@media \(min-width:\s*1600px\)/)
		expect(workspaceRail).toMatch(/minmax\(420px,\s*0\.9fr\)/)
		expect(workspaceRail).toMatch(/--nc-print-print-rail-min/)
	})

	it('density toggle lives in chrome + Ctrl+K palette', () => {
		expect(commands).toMatch(/Toggle density \(Comfortable \/ Ultrawide\)/)
		expect(chromeBar).toMatch(/nc-print-chrome-bar__density/)
		expect(chromeBar).toMatch(/toggleDensityPref/)
	})

	it('Overview uses a two-column grid at ≥1600', () => {
		expect(overview).toMatch(/@media \(min-width:\s*1600px\)/)
		expect(overview).toMatch(/repeat\(2,\s*minmax\(0,\s*1fr\)\)/)
	})

	it('offsets the sticky rail below the chrome bar', () => {
		expect(workspaceRail).toMatch(/top:\s*var\(--nc-print-chrome-h/)
	})

	it('workflow subtitle no longer hard-clips with white-space:nowrap', () => {
		const rule = styleScss.match(/\.nc-print-workflow__sub \{([^}]*)\}/)
		expect(rule).not.toBeNull()
		expect(rule[1]).not.toMatch(/white-space:\s*nowrap/)
	})

	it('print status bar does not cover the chrome; the monitor cluster owns the offset', () => {
		const rule = statusBar.match(/\.nc-print-statusbar \{([^}]*)\}/)
		expect(rule).not.toBeNull()
		expect(rule[1]).not.toMatch(/top:\s*var\(--nc-print-chrome-h/)
		expect(rule[1]).not.toMatch(/position:\s*sticky/)
		expect(workspaceRail).toMatch(/position:\s*sticky/)
		expect(workspaceRail).toMatch(/top:\s*var\(--nc-print-chrome-h/)
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
		expect(styleScss).not.toMatch(/\.nc-print-camera-pip\b/)
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
