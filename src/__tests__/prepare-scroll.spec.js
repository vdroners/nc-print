/**
 * @vitest-environment node
 * Prepare scrollbar map (live 1.72.0, 1280×800): the page scrolled the workspace
 * card ~100px, the left panel scrolled on its own, and Comfortable added a
 * horizontal bar when Draft/Standard/Fine did not wrap.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { prepareStageHeight } from '@/utils/prepare-stage.js'

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const layout = read('../components/PrepareStudioLayout.vue')
const styleScss = read('../../css/style.scss')
const overrides = read('../components/PrepareOverrides.vue')
const app = read('../App.vue')

describe('prepare stage fills the shell, not the viewport', () => {
	it('subtracts banner, footer, padding, and the workflow bar from the shell', () => {
		// 800px window, header already outside the shell. Banner 56, footer 40,
		// body padding 16+16, workflow bar 52 → the card must be the remainder,
		// not ~100dvh (which was the page's ~100px scroll).
		expect(prepareStageHeight({
			shellHeight: 750,
			bannerHeight: 56,
			footerHeight: 40,
			chromeHeight: 52,
			padTop: 16,
			padBottom: 16,
		})).toBe(750 - 56 - 40 - 52 - 32)
	})

	it('never returns a negative or non-finite stage', () => {
		expect(prepareStageHeight({ shellHeight: 10, bannerHeight: 80 })).toBe(0)
		expect(prepareStageHeight({ shellHeight: Number.NaN })).toBe(0)
	})

	it('floors subpixels so the card cannot exceed the shell by a fraction', () => {
		expect(prepareStageHeight({
			shellHeight: 700.9,
			bannerHeight: 56,
			footerHeight: 40.2,
			chromeHeight: 52,
			padTop: 16,
			padBottom: 16,
		})).toBe(Math.floor(700.9 - 56 - 40.2 - 52 - 32))
	})
})

describe('page does not scroll the Prepare card', () => {
	it('locks the Nextcloud content box and the app root', () => {
		expect(styleScss).toMatch(/body\.app-nc_print #app-content/)
		expect(styleScss).toMatch(/#app-content-vue \{\s*overflow:\s*hidden/)
		const root = styleScss.match(/#nc-print-root \{([^}]*)\}/)
		expect(root).not.toBeNull()
		expect(root[1]).toMatch(/overflow:\s*hidden/)
		expect(root[1]).toMatch(/max-height:\s*100%/)
		expect(root[1]).not.toMatch(/min-height:\s*60vh/)
	})

	it('sizes the wide studio from the measured stage, not 100dvh', () => {
		expect(layout).not.toMatch(/100dvh/)
		expect(layout).toMatch(/--nc-print-stage-h/)
		expect(layout).toMatch(/@media \(min-width:\s*1201px\)/)
		expect(app).toMatch(/--nc-print-stage-h/)
		expect(app).toMatch(/prepareStageHeight/)
	})

	it('clips a measurement miss inside the tab instead of the page', () => {
		expect(styleScss).toMatch(
			/@media \(min-width:\s*1201px\) \{[\s\S]*?\.nc-print-tab-scroll:has\(\.nc-print-prepare-studio--immersive\) \{[^}]*overflow:\s*hidden/,
		)
	})
})

describe('side cards scroll inside the workspace', () => {
	it('left and right scroll vertically and do not chain the wheel', () => {
		const m = layout.match(/--immersive \.nc-print-prepare-studio__left,[\s\S]*?\{([^}]*)\}/)
		expect(m).not.toBeNull()
		expect(m[1]).toMatch(/overflow-y:\s*auto/)
		expect(m[1]).toMatch(/overflow-x:\s*hidden/)
		expect(m[1]).toMatch(/overscroll-behavior:\s*contain/)
		expect(m[1]).toMatch(/min-width:\s*0/)
	})

	it('drops the inner scroll on the stacked narrow layout', () => {
		expect(layout).toMatch(/@media \(max-width:\s*1200px\)/)
		expect(layout).toMatch(/overflow:\s*visible/)
	})
})

describe('comfortable quality row does not force a horizontal bar', () => {
	it('wraps Draft / Standard / Fine and allows the row to shrink', () => {
		const row = overrides.match(/\.nc-print-quality-row \{([^}]*)\}/)
		const tiers = overrides.match(/\.nc-print-quality-row__tiers \{([^}]*)\}/)
		expect(row).not.toBeNull()
		expect(tiers).not.toBeNull()
		expect(row[1]).toMatch(/flex-wrap:\s*wrap/)
		expect(row[1]).toMatch(/min-width:\s*0/)
		expect(tiers[1]).toMatch(/flex-wrap:\s*wrap/)
		expect(tiers[1]).toMatch(/min-width:\s*0/)
	})
})

describe('workflow bar is an opaque slab', () => {
	it('paints the app background and pads below the pill', () => {
		const chrome = styleScss.match(/\.nc-print-chrome \{([^}]*)\}/)
		expect(chrome).not.toBeNull()
		expect(chrome[1]).toMatch(/position:\s*sticky/)
		expect(chrome[1]).toMatch(/background-color:\s*var\(--nc-gcs-bg-app/)
		expect(chrome[1]).toMatch(/padding:[^;]*var\(--nc-gcs-space-md\)/)
		// Negative top margin let the card slide under the stepper.
		expect(chrome[1]).not.toMatch(/margin:\s*calc\(-1 \* var\(--nc-gcs-space-lg\)\)/)
		expect(chrome[1]).toMatch(/scroll-padding-top|margin:\s*0 calc/)
	})

	it('offsets in-page scroll by the bar height', () => {
		expect(styleScss).toMatch(/scroll-padding-top:\s*var\(--nc-print-chrome-h/)
	})
})
