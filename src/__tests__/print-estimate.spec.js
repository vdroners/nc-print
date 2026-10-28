/**
 * @vitest-environment node
 * Honest print estimates: never treat a missing slicer time or Moonraker's
 * elapsed total_duration as an overrun.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { setActivePinia, createPinia } from 'pinia'
import {
	estimateSecondsFromMetadata,
	formatEstimateActualLine,
	parseDurationFromFilename,
	remainingFromEstimate,
	resolvePrintEstimateSeconds,
} from '@/utils/print-estimate.js'

vi.mock('@nextcloud/router', () => ({
	generateUrl: (path) => `https://cloud.example${path}`,
}))
vi.mock('@nextcloud/axios', () => ({
	default: { post: vi.fn(), get: vi.fn() },
}))
vi.mock('@/services/toast.js', () => ({
	toastError: vi.fn(), toastSuccess: vi.fn(), toastWarning: vi.fn(), toastInfo: vi.fn(),
}))
vi.mock('@/services/slicer-api.js', () => ({
	fetchProfiles: vi.fn(async () => []), sliceStream: vi.fn(), downloadGcode: vi.fn(),
	uploadAndStart: vi.fn(), cancelSliceJob: vi.fn(),
}))
vi.mock('@/services/moonraker-api.js', () => ({
	fetchState: vi.fn(async () => ({})), uploadAndStart: vi.fn(), cameraStreamUrl: vi.fn(() => ''),
}))
vi.mock('@/services/config-api.js', () => ({ fetchConfig: vi.fn(async () => ({})) }))
vi.mock('@/services/status-api.js', () => ({ fetchAppStatus: vi.fn(async () => ({})) }))
vi.mock('@/services/files-api.js', () => ({ fetchModelBlob: vi.fn(), resolveFile: vi.fn() }))
vi.mock('@/services/gcode-save-api.js', () => ({ saveGcodeToFiles: vi.fn() }))
vi.mock('@/services/moonraker-ws.js', () => ({ MoonrakerWsClient: vi.fn() }))
vi.mock('@/services/mesh-convert.js', async (importOriginal) => {
	const actual = await importOriginal()
	return { ...actual, convert3mfToStlBuffer: vi.fn(), list3mfBuildItems: vi.fn(async () => []) }
})

import { usePrintStore } from '@/store/print.js'

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

const TEN_H = 10 * 3600 + 12 * 60 + 12
const CONE = 'rear_cone_v4 - Rear Cone (1).step_A_PA-CF_10h12m12s.gcode'

describe('filename and metadata estimates', () => {
	it('reads a trailing slicer duration and ignores millimeters', () => {
		expect(parseDurationFromFilename(CONE)).toBe(TEN_H)
		expect(parseDurationFromFilename('job_1h2m.gcode')).toBe(3720)
		expect(parseDurationFromFilename('benchy_45m30s.gcode')).toBe(45 * 60 + 30)
		expect(parseDurationFromFilename('part_0.2mm_PLA.gcode')).toBeNull()
		expect(parseDurationFromFilename('10hex.gcode')).toBeNull()
		expect(parseDurationFromFilename('no-time.gcode')).toBeNull()
		expect(parseDurationFromFilename('')).toBeNull()
	})

	it('reads Moonraker metadata estimated_time and ignores zero', () => {
		expect(estimateSecondsFromMetadata({ result: { estimated_time: 36732.4 } })).toBe(36732.4)
		expect(estimateSecondsFromMetadata({ estimated_time: 0 })).toBeNull()
		expect(estimateSecondsFromMetadata({})).toBeNull()
		expect(estimateSecondsFromMetadata(null)).toBeNull()
	})

	it('prefers metadata, then a matching slicer file, then the filename', () => {
		expect(resolvePrintEstimateSeconds({
			metadataEstimateS: 4000,
			slicerEstimateS: 5000,
			slicerFilename: CONE,
			filename: CONE,
		})).toEqual({ seconds: 4000, source: 'metadata' })

		expect(resolvePrintEstimateSeconds({
			metadataEstimateS: 0,
			slicerEstimateS: 5000,
			slicerFilename: 'gcodes/cone.gcode',
			filename: '/gcodes/cone.gcode',
		})).toEqual({ seconds: 5000, source: 'slicer' })

		expect(resolvePrintEstimateSeconds({
			slicerEstimateS: 5000,
			slicerFilename: 'other.gcode',
			filename: CONE,
		})).toEqual({ seconds: TEN_H, source: 'filename' })

		expect(resolvePrintEstimateSeconds({
			slicerEstimateS: 0,
			filename: 'plain.gcode',
		})).toBeNull()
	})
})

describe('estimate labels', () => {
	it('never shows a plus overrun when the estimate is zero or missing', () => {
		expect(formatEstimateActualLine(0, 180)).toBe('Estimate unavailable')
		expect(formatEstimateActualLine(null, 180)).toBe('Estimate unavailable')
		expect(formatEstimateActualLine(0, 180)).not.toMatch(/\+/)
		expect(formatEstimateActualLine(null, null)).toBeNull()
	})

	it('shows the real estimate and a signed delta only then', () => {
		expect(formatEstimateActualLine(TEN_H, 180)).toBe('Estimated 10h 12m · Actual 3 min (−10h 9m)')
		expect(formatEstimateActualLine(60, 180)).toBe('Estimated 1 min · Actual 3 min (+2 min)')
		expect(formatEstimateActualLine(TEN_H, null)).toBe('Estimated 10h 12m')
	})

	it('does not invent remaining time from elapsed wall clock', () => {
		expect(remainingFromEstimate(null, 180)).toBeNull()
		expect(remainingFromEstimate(0, 180)).toBeNull()
		expect(remainingFromEstimate(TEN_H, 180)).toBe(TEN_H - 180)
		expect(remainingFromEstimate(TEN_H, null)).toBe(TEN_H)
	})
})

function ensureStorage() {
	if (typeof globalThis.localStorage !== 'undefined' && globalThis.localStorage) {
		return
	}
	const mem = new Map()
	globalThis.localStorage = {
		getItem: (key) => (mem.has(key) ? mem.get(key) : null),
		setItem: (key, value) => mem.set(key, String(value)),
		removeItem: (key) => mem.delete(key),
		clear: () => mem.clear(),
	}
}

describe('print store estimate getters', () => {
	beforeEach(() => {
		ensureStorage()
		localStorage.clear()
		setActivePinia(createPinia())
	})

	it('uses the filename when Moonraker total_duration is only elapsed time', () => {
		const store = usePrintStore()
		store.printerState.filename = CONE
		store.printerState.printDuration = 180
		store.printerState.totalDuration = 180
		store.sliceJob.estimatedTimeS = 0
		expect(store.resolvedPrintEstimate).toEqual({ seconds: TEN_H, source: 'filename' })
		expect(store.estimateVsActual.estimatedS).toBe(TEN_H)
		expect(store.remainingPrintSeconds).toBe(TEN_H - 180)
		expect(formatEstimateActualLine(
			store.estimateVsActual.estimatedS,
			store.estimateVsActual.actualS,
		)).not.toMatch(/Estimated 0/)
	})

	it('says the estimate is unavailable when nothing knows the duration', () => {
		const store = usePrintStore()
		store.printerState.filename = 'plain.gcode'
		store.printerState.printDuration = 120
		store.printerState.totalDuration = 120
		store.sliceJob.estimatedTimeS = 0
		expect(store.resolvedPrintEstimate).toBeNull()
		expect(store.remainingPrintSeconds).toBeNull()
		expect(store.estimateVsActual).toEqual({
			estimatedS: null,
			actualS: 120,
			source: null,
		})
	})
})

describe('print tab walkthrough source', () => {
	const tab = read('../components/PrintTab.vue')
	const bar = read('../components/PrintStatusBar.vue')
	const rail = read('../components/WorkspaceRail.vue')
	const thumb = read('../components/GcodeThumbnail.vue')
	const timelapse = read('../components/TimelapsePanel.vue')
	const connection = read('../components/PrinterConnectionStatus.vue')
	const tuning = read('../components/InPrintTuningPanel.vue')
	const temp = read('../components/TemperatureControl.vue')
	const theme = read('../../css/nc-print-theme.css')
	const style = read('../../css/style.scss')

	it('drops the duplicate Printing badge and the Polling label', () => {
		expect(tab).not.toMatch(/nc-print-badge--info/)
		expect(tab).not.toMatch(/Polling/)
		expect(tab).toContain('Updating live')
		expect(tab).toContain('formatEstimateActualLine')
	})

	it('gives the sticky filename a native title and lets it shrink', () => {
		expect(bar).toMatch(/nc-print-statusbar__name" :title="filename"/)
		expect(bar).toMatch(/\.nc-print-statusbar__name \{[^}]*min-width:\s*0/)
	})

	it('clips horizontal overflow in the camera column', () => {
		expect(rail).toMatch(/overflow-x:\s*hidden/)
		expect(rail).toMatch(/max-width:\s*100%/)
	})

	it('replaces a failed thumbnail with a placeholder, not a broken image', () => {
		expect(thumb).toMatch(/@error="onThumbError"/)
		expect(thumb).toMatch(/nc-print-gcode-thumb--placeholder/)
		expect(thumb).toMatch(/v-if="src && !broken"/)
	})

	it('treats a missing timelapse root as an accepted empty list', () => {
		expect(timelapse).toContain('isMissingTimelapseRoot')
		expect(timelapse).toContain('acceptErrorStatuses: [400, 404]')
	})

	it('names the printer switch and shows the fan percent beside the slider', () => {
		expect(connection).toContain('Change printer')
		expect(connection).not.toContain('Change in Overview')
		expect(tuning).toMatch(/nc-print-tuning__fan-value/)
		expect(tuning).toContain('{{ fan }}%')
	})

	it('stretches the operate cards and raises the temperature plot', () => {
		expect(tab).toMatch(/align-items:\s*stretch/)
		expect(temp).toContain(':height="120"')
		expect(temp).toContain('nc-print-temp-control__name')
	})

	it('raises stepper and footer text one step above muted', () => {
		expect(theme).toContain('--nc-print-text-raised: #b1bac4')
		expect(theme).toMatch(/nc-gcs-app-shell__footer \{[^}]*nc-print-text-raised/)
		expect(style).toMatch(/\.nc-print-workflow__sub \{[^}]*nc-print-text-raised/)
	})
})
