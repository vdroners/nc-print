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
const modal = read('../components/PrePrintModal.vue')
const picker = read('../components/TargetPrinterPicker.vue')

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
		// Visible label, so the cog is not a generic settings icon.
		expect(chrome).toMatch(/nc-print-chrome-bar__overview-label">Overview/)
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
		// Live panels stay. The fleet Scan/IP picker does not — Print shows
		// the printer name and status only.
		expect(print).not.toMatch(/MultiPrinterPicker/)
		expect(print).not.toMatch(/TargetPrinterPicker/)
		expect(print).not.toMatch(/Scan for printers/)
		expect(print).not.toMatch(/Connect by IP/)
		expect(print).toMatch(/PrinterConnectionStatus/)
		expect(print).toMatch(/JobHistoryPanel/)
		expect(print).toMatch(/WebcamListPanel/) // dual-hosted
	})

	it('Prepare shows printer name and status, not the fleet picker', () => {
		expect(prepare).not.toMatch(/TargetPrinterPicker/)
		expect(prepare).not.toMatch(/Scan for printers/)
		expect(prepare).not.toMatch(/Connect by IP/)
		expect(prepare).toMatch(/PrinterConnectionStatus/)
	})

	it('Overview fleet still has the full Scan / IP picker', () => {
		expect(overview).toMatch(/<TargetPrinterPicker/)
		expect(overview).not.toMatch(/show-scan="false"/)
		expect(picker).toMatch(/Scan for printers/)
		expect(picker).toMatch(/Connect by IP/)
	})

	it('Pre-print modal still changes the target without a scan button', () => {
		expect(modal).toMatch(/TargetPrinterPicker/)
		expect(modal).toMatch(/variant="modal"/)
		expect(modal).toMatch(/:show-scan="false"/)
	})

	it('Prepare import section opens Parts Library and Model Forge', () => {
		expect(prepare).toMatch(/openPartsLibrary/)
		expect(prepare).toMatch(/openModelForge/)
		expect(prepare).toMatch(/aria-label="Parts Library"/)
		expect(prepare).toMatch(/>\s*Library\s*</)
		expect(prepare).toMatch(/aria-label="Model Forge"/)
		expect(prepare).toMatch(/>\s*Model Forge\s*</)
		expect(prepare).toMatch(/openOverviewSection\(this\.printStore, OVERVIEW_LIBRARY_ID\)/)
		expect(prepare).toMatch(/openOverviewSection\(this\.printStore, OVERVIEW_FORGE_ID\)/)
		// Left-rail import stays.
		expect(prepare).toMatch(/Import STL\/3MF\/OBJ/)
		// Management sections are not start-job buttons on Prepare.
		expect(prepare).not.toMatch(/Achievements/)
		expect(prepare).not.toMatch(/Print Guard/)
		expect(prepare).not.toMatch(/Materials &amp; calibration/)
		expect(prepare).not.toMatch(/Printer fleet/)
	})

	it('Overview still hosts library and forge and can expand them in place', () => {
		expect(overview).toMatch(/id="overview-library"/)
		expect(overview).toMatch(/id="overview-modelforge"/)
		expect(overview).toMatch(/ref="overview-library"/)
		expect(overview).toMatch(/ref="overview-modelforge"/)
		expect(overview).toMatch(/OVERVIEW_FOCUS_EVENT/)
		expect(overview).toMatch(/consumePendingOverviewSection/)
		expect(overview).toMatch(/section\?\.expand\?\.\(\)/)
		const achievements = overview.indexOf('id="overview-achievements"')
		const library = overview.indexOf('id="overview-library"')
		const forge = overview.indexOf('id="overview-modelforge"')
		const guard = overview.indexOf('id="overview-guard"')
		const cameras = overview.indexOf('id="overview-cameras"')
		expect(achievements).toBeGreaterThan(-1)
		expect(achievements).toBeLessThan(library)
		expect(library).toBeLessThan(forge)
		expect(forge).toBeLessThan(guard)
		expect(guard).toBeLessThan(cameras)
	})
})
