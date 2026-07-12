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
const historyBox = read('../components/ViewportHistoryBox.vue')
const orientPad = read('../components/ViewportOrientPad.vue')
const toolPanel = read('../components/PrepareToolPanel.vue')
const toolRail = read('../components/PrepareToolRail.vue')
const chromeCss = read('../../css/style.css')

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
		// Right offset thinned to 276px in v1.55.0 (right card 260px + margin).
		expect(prepare).toMatch(/nc-print-tool-panel\)\s*\{\s*right:\s*276px/)
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

describe('Prepare controls overhaul (v1.54.0)', () => {
	it('sticky chrome sits above the immersive overlays (z-index > 6)', () => {
		const m = chromeCss.match(/\.nc-print-chrome \{([^}]*)\}/)
		expect(m).not.toBeNull()
		expect(m[1]).toMatch(/position:\s*sticky/)
		const z = Number((m[1].match(/z-index:\s*(\d+)/) || [])[1])
		expect(z).toBeGreaterThan(6)
	})

	it('Import cluster lives in a left-panel collapsible, not the viewport center', () => {
		expect(prepare).toMatch(/id="prepare-import"/)
		expect(prepare).toMatch(/nc-print-import-section/)
		expect(prepare).toMatch(/Import STL\/3MF\/OBJ/)
		// The old floating center import cluster is gone.
		expect(prepare).not.toMatch(/nc-print-import-cluster/)
	})

	it('history box (undo/redo/reset) is docked top-right in immersive', () => {
		expect(prepare).toMatch(/ViewportHistoryBox/)
		const m = prepare.match(/--immersive \.nc-print-viewport-history \{([^}]*)\}/)
		expect(m).not.toBeNull()
		expect(m[1]).toMatch(/position:\s*absolute/)
		expect(m[1]).toMatch(/right:/)
		// binds to the slice-aware undo gate
		expect(historyBox).toMatch(/canUndoAny/)
	})

	it('orient keypad is docked bottom-right in immersive', () => {
		expect(prepare).toMatch(/ViewportOrientPad/)
		const m = prepare.match(/--immersive \.nc-print-viewport-orientpad \{([^}]*)\}/)
		expect(m).not.toBeNull()
		expect(m[1]).toMatch(/position:\s*absolute/)
		expect(m[1]).toMatch(/bottom:/)
		// keypad exposes center + per-axis rotate + lay flat + scale to fit
		expect(orientPad).toMatch(/rotate', 'x'/)
		expect(orientPad).toMatch(/lay-flat/)
		expect(orientPad).toMatch(/scale-to-fit/)
	})

	it('auto-orient is a rail tool with three modes in its panel', () => {
		expect(toolRail).toMatch(/id: 'autoorient'/)
		expect(toolPanel).toMatch(/tool === 'autoorient'/)
		expect(toolPanel).toMatch(/auto-orient', 'default'/)
		expect(toolPanel).toMatch(/auto-orient', 'supports'/)
		expect(toolPanel).toMatch(/auto-orient', 'footprint'/)
	})
})
