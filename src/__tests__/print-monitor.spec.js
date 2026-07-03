import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/services/toast.js', () => ({
	toastError: vi.fn(),
	toastSuccess: vi.fn(),
	toastWarning: vi.fn(),
	toastInfo: vi.fn(),
}))

vi.mock('@/services/slicer-api.js', () => ({
	fetchProfiles: vi.fn(async () => []),
	sliceStream: vi.fn(),
	downloadGcode: vi.fn(),
	uploadAndStart: vi.fn(),
	cancelSliceJob: vi.fn(),
}))

vi.mock('@/services/moonraker-api.js', () => ({
	fetchState: vi.fn(async () => ({})),
	uploadAndStart: vi.fn(),
	cameraStreamUrl: vi.fn(() => ''),
}))

vi.mock('@/services/config-api.js', () => ({
	fetchConfig: vi.fn(async () => ({})),
}))

vi.mock('@/services/status-api.js', () => ({
	fetchAppStatus: vi.fn(async () => ({})),
}))

vi.mock('@/services/files-api.js', () => ({
	fetchModelBlob: vi.fn(),
	resolveFile: vi.fn(),
}))

vi.mock('@/services/gcode-save-api.js', () => ({
	saveGcodeToFiles: vi.fn(),
}))

vi.mock('@/services/moonraker-ws.js', () => ({
	MoonrakerWsClient: vi.fn(),
}))

vi.mock('@/services/mesh-convert.js', async (importOriginal) => {
	const actual = await importOriginal()
	return {
		...actual,
		convert3mfToStlBuffer: vi.fn(),
		list3mfBuildItems: vi.fn(async () => []),
	}
})

import { usePrintStore } from '@/store/print.js'

function read(rel) {
	return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
}

describe('WS4: Print monitor', () => {
	beforeEach(() => {
		localStorage.clear()
		setActivePinia(createPinia())
	})

	// G31: completion filament stats getter
	it('lastCompletedSliceStats is null until a slice completes', () => {
		const store = usePrintStore()
		store.sliceJob.status = 'idle'
		expect(store.lastCompletedSliceStats).toBeNull()
	})

	it('lastCompletedSliceStats rolls up filament + time from the done slice', () => {
		const store = usePrintStore()
		store.sliceJob.status = 'done'
		store.sliceJob.estimatedTimeS = 3600
		store.sliceJob.filamentUsedG = 42.4
		// model/support grams live under materialStats (set by _applyMaterialStats)
		store.sliceJob.materialStats = { modelFilamentG: 37.2, supportFilamentG: 5.2 }
		store.sliceJob.gcodeFilename = 'part.gcode'
		const s = store.lastCompletedSliceStats
		expect(s).not.toBeNull()
		expect(s.estimatedTimeS).toBe(3600)
		expect(Math.round(s.filamentUsedG)).toBe(42)
		expect(Math.round(s.supportFilamentG)).toBe(5)
		expect(Math.round(s.modelFilamentG)).toBe(37)
		expect(s.gcodeFilename).toBe('part.gcode')
	})

	// G31: compact job history mounted on Print
	it('PrintTab mounts a compact, capped JobHistoryPanel', () => {
		const src = read('../components/PrintTab.vue')
		expect(src).toMatch(/<JobHistoryPanel\s+compact\s+:limit="5"\s*\/>/)
	})

	it('JobHistoryPanel supports compact + limit props', () => {
		const src = read('../components/JobHistoryPanel.vue')
		expect(src).toMatch(/compact:\s*\{\s*type:\s*Boolean/)
		expect(src).toMatch(/limit:\s*\{\s*type:\s*Number/)
		expect(src).toMatch(/this\.limit\s*>\s*0\s*\?\s*all\.slice\(0,\s*this\.limit\)/)
	})

	// G31: camera fullscreen
	it('PrintTab wires a fullscreen camera overlay with Escape close', () => {
		const src = read('../components/PrintTab.vue')
		expect(src).toContain('openCameraFullscreen')
		expect(src).toContain('closeCameraFullscreen')
		expect(src).toContain('nc-print-camera-fullscreen')
		expect(src).toMatch(/e\.key === 'Escape'/)
	})

	// G31: completion banner surfaces filament label
	it('PrintCompletionBanner surfaces filament usage', () => {
		const src = read('../components/PrintCompletionBanner.vue')
		expect(src).toContain('filamentLabel')
		expect(src).toContain('lastCompletedSliceStats')
	})
})
