/**
 * @vitest-environment node
 * Source-regex checks for the full-bleed "immersive" Prepare layout (reads .vue
 * off disk; node env so fileURLToPath works — matches layout-cohesion.spec).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const layout = read('../components/PrepareStudioLayout.vue')
const prepare = read('../components/PrepareTab.vue')
const slice = read('../components/SliceTab.vue')
const toolpath = read('../components/Toolpath3D.vue')

describe('immersive full-bleed layout', () => {
	it('PrepareStudioLayout exposes a reversible mode prop (studio|immersive)', () => {
		expect(layout).toMatch(/mode:\s*\{/)
		expect(layout).toMatch(/\['studio', 'immersive'\]/)
	})

	it('immersive makes the viewport fill the background (center inset:0)', () => {
		expect(layout).toMatch(/nc-print-prepare-studio--immersive/)
		const m = layout.match(/--immersive \.nc-print-prepare-studio__center \{([^}]*)\}/)
		expect(m).not.toBeNull()
		expect(m[1]).toMatch(/position:\s*absolute/)
		expect(m[1]).toMatch(/inset:\s*0/)
	})

	it('side panels float as scrollable, scroll-contained overlay cards', () => {
		const m = layout.match(/--immersive \.nc-print-prepare-studio__left,[\s\S]*?\{([^}]*)\}/)
		expect(m).not.toBeNull()
		expect(m[1]).toMatch(/position:\s*absolute/)
		expect(m[1]).toMatch(/overflow-y:\s*auto/)
		expect(m[1]).toMatch(/overscroll-behavior:\s*contain/)
		expect(m[1]).toMatch(/backdrop-filter/)
	})

	it('collapses to static columns below the 1200px breakpoint', () => {
		// The immersive block is reset to position:static inside a max-width:1200 query.
		expect(layout).toMatch(/@media \(max-width:\s*1200px\)/)
		expect(layout).toMatch(/--immersive \{[\s\S]*?position:\s*static/)
	})

	it('PrepareTab opts into immersive and offsets rail/panel inboard of the cards', () => {
		expect(prepare).toMatch(/mode="immersive"/)
		expect(prepare).toMatch(/nc-print-prepare--immersive/)
		// rail/panel offset only applies on wide screens.
		expect(prepare).toMatch(/@media \(min-width:\s*1201px\)/)
		expect(prepare).toMatch(/nc-print-tool-rail\)\s*\{\s*left:\s*316px/)
		expect(prepare).toMatch(/nc-print-tool-panel\)\s*\{\s*right:\s*316px/)
	})

	it('SliceTab reuses the immersive studio layout with the toolpath as background', () => {
		expect(slice).toMatch(/PrepareStudioLayout/)
		expect(slice).toMatch(/mode="immersive"/)
		// Toolpath3D fills the center (#center slot) in immersive mode.
		expect(slice).toMatch(/#center/)
		expect(slice).toMatch(/<Toolpath3D[\s\S]*?mode="immersive"/)
		// Workflow cards on the left, results on the right.
		expect(slice).toMatch(/#left/)
		expect(slice).toMatch(/#right/)
		expect(slice).toMatch(/SliceResultTabs/)
	})

	it('Toolpath3D supports an immersive mode with a floating bottom control bar', () => {
		expect(toolpath).toMatch(/mode:\s*\{/)
		expect(toolpath).toMatch(/\['panel', 'immersive'\]/)
		expect(toolpath).toMatch(/tp3d--immersive/)
		// controls float at the bottom, viewport fills (inset:0).
		const m = toolpath.match(/\.tp3d--immersive \.tp3d__controls \{([^}]*)\}/)
		expect(m).not.toBeNull()
		expect(m[1]).toMatch(/position:\s*absolute/)
		expect(m[1]).toMatch(/bottom:/)
		expect(m[1]).toMatch(/backdrop-filter/)
		// narrow screens fall back to a static bar.
		expect(toolpath).toMatch(/@media \(max-width:\s*1200px\)/)
	})
})
