/**
 * @vitest-environment node
 * Source-regex checks for the Overview management tab (v1.55.0): tab constant,
 * nav wiring, the assembled OverviewTab sections, and the relocations off the
 * workflow tabs. Reads .vue/.js off disk (node env for fileURLToPath).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const tabs = read('../constants/tabs.js')
const app = read('../App.vue')
const chrome = read('../components/AppChromeBar.vue')
const banner = read('../components/PrintWorkflowBanner.vue')
const overview = read('../components/OverviewTab.vue')
const slice = read('../components/SliceTab.vue')
const print = read('../components/PrintTab.vue')
const prepare = read('../components/PrepareTab.vue')

describe('Overview tab (v1.55.0)', () => {
	it('tabs.js defines an OVERVIEW constant', () => {
		expect(tabs).toMatch(/OVERVIEW:\s*'overview'/)
	})

	it('App.vue lazy-imports + renders OverviewTab and has hotkey 4', () => {
		expect(app).toMatch(/OverviewTab = \(\) => import\(.*nc-print-overview/)
		expect(app).toMatch(/<OverviewTab v-if="printStore\.activeTab === TABS\.OVERVIEW"/)
		expect(app).toMatch(/e\.key === '4'/)
	})

	it('AppChromeBar has a non-workflow Overview nav button', () => {
		expect(chrome).toMatch(/nc-print-chrome-bar__overview/)
		expect(chrome).toMatch(/onOverviewClick/)
		expect(chrome).toMatch(/TABS\.OVERVIEW/)
	})

	it('PrintWorkflowBanner still has exactly 3 workflow steps (Overview is NOT a step)', () => {
		// STEPS array literal should list prepare/slice/print only.
		expect(banner).toMatch(/PREPARE/)
		expect(banner).toMatch(/SLICE/)
		expect(banner).toMatch(/PRINT/)
		expect(banner).not.toMatch(/OVERVIEW/)
	})

	it('OverviewTab hosts the fleet + 4 ported pillars + relocated panels', () => {
		expect(overview).toMatch(/TargetPrinterPicker/)
		expect(overview).toMatch(/FilamentInventoryPanel/)
		expect(overview).toMatch(/AnalyticsPanel/)
		expect(overview).toMatch(/MaintenancePanel/)
		expect(overview).toMatch(/AchievementsPanel/)
		expect(overview).toMatch(/MaterialInfoPanel/)
		expect(overview).toMatch(/CalibrationPanel/)
		expect(overview).toMatch(/PrintHistoryPanel/)
		expect(overview).toMatch(/HistoryPanel/)
		expect(overview).toMatch(/WebcamListPanel/)
		// Namespaced collapsible ids avoid clashing persisted state.
		expect(overview).toMatch(/id="overview-printers"/)
		expect(overview).toMatch(/id="overview-filament"/)
		expect(overview).toMatch(/id="overview-achievements"/)
	})

	it('relocations: Slice no longer imports Calibration/Material', () => {
		expect(slice).not.toMatch(/import CalibrationPanel/)
		expect(slice).not.toMatch(/import MaterialInfoPanel/)
	})

	it('relocations: Print no longer imports History/PrintHistory but keeps live panels', () => {
		expect(print).not.toMatch(/import HistoryPanel/)
		expect(print).not.toMatch(/import PrintHistoryPanel/)
		// Live panels stay.
		expect(print).toMatch(/MultiPrinterPicker/)
		expect(print).toMatch(/JobHistoryPanel/)
		expect(print).toMatch(/WebcamListPanel/) // dual-hosted
	})

	it('Prepare keeps its in-flow TargetPrinterPicker (workflow gate)', () => {
		expect(prepare).toMatch(/TargetPrinterPicker/)
	})
})
