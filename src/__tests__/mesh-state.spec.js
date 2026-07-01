import { describe, it, expect, beforeEach, vi } from 'vitest'
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
}))

vi.mock('@/services/config-api.js', () => ({
	fetchConfig: vi.fn(async () => ({})),
}))

vi.mock('@/services/status-api.js', () => ({
	fetchAppStatus: vi.fn(async () => ({ slicer_ok: true, moonraker_ok: true, slicer_enabled: true, moonraker_enabled: true })),
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

const PREFS_KEY = 'nc_print_prefs_v1'

function makeFile(name, content = 'solid test') {
	return new File([content], name, { type: 'application/octet-stream' })
}

describe('meshState (Sprint B)', () => {
	beforeEach(() => {
		localStorage.clear()
		setActivePinia(createPinia())
	})

	it('starts with clean meshState defaults', () => {
		const store = usePrintStore()
		expect(store.meshState.dirty).toBe(false)
		expect(store.meshState.sliceBlob).toBeNull()
		expect(store.meshState.position).toEqual([0, 0, 0])
		expect(store.meshState.rotation).toEqual([0, 0, 0])
		expect(store.meshState.scale).toEqual([1, 1, 1])
		expect(store.meshState.autoApply).toBe(true)
	})

	it('restorePrefs defaults autoApply to true when omitted', () => {
		localStorage.setItem(PREFS_KEY, JSON.stringify({
			meshTransform: {
				position: [1, 2, 0],
				dirty: false,
				modelName: 'part.stl',
			},
		}))
		const store = usePrintStore()
		store.model.name = 'part.stl'
		store.restorePrefs()
		expect(store.meshState.autoApply).toBe(true)
	})

	it('markMeshDirty sets dirty when a model is loaded', () => {
		const store = usePrintStore()
		store.model.file = makeFile('cube.stl')
		store.markMeshDirty()
		expect(store.meshState.dirty).toBe(true)
	})

	it('setModel resets meshState', () => {
		const store = usePrintStore()
		store.meshState.dirty = true
		store.meshState.sliceBlob = makeFile('applied.stl')
		store.setModel(makeFile('new.stl'), 'import')
		expect(store.meshState.dirty).toBe(false)
		expect(store.meshState.sliceBlob).toBeNull()
	})

	it('sliceModelFile prefers applied sliceBlob when clean', () => {
		const store = usePrintStore()
		const original = makeFile('original.stl')
		const applied = makeFile('applied.stl')
		store.model.file = original
		store.meshState.sliceBlob = applied
		store.meshState.dirty = false
		expect(store.sliceModelFile()).toBe(applied)
	})

	it('sliceModelFile ignores stale sliceBlob when dirty', () => {
		const store = usePrintStore()
		const original = makeFile('original.stl')
		const applied = makeFile('applied.stl')
		store.model.file = original
		store.meshState.sliceBlob = applied
		store.meshState.dirty = true
		expect(store.sliceModelFile()).toBe(original)
	})

	it('applyMeshToSlice exports viewport mesh and clears dirty', async () => {
		const store = usePrintStore()
		store.model.file = makeFile('cube.stl')
		store.model.name = 'cube.stl'

		const positions = new Float32Array([
			0, 0, 0,
			10, 0, 0,
			0, 10, 0,
		])
		const indices = new Uint32Array([0, 1, 2])

		const viewport = {
			getTransform: () => ({
				position: [1, 2, 0],
				rotation: [0, 0, 0],
				scale: [1, 1, 1],
				bbox: { x: 10, y: 10, z: 0 },
			}),
			exportTransformedMesh: vi.fn(async () => ({ positions, indices, bbox: { x: 10, y: 10, z: 0 } })),
		}

		const ok = await store.applyMeshToSlice(viewport)
		expect(ok).toBe(true)
		expect(store.meshState.dirty).toBe(false)
		expect(store.meshState.sliceBlob).toBeTruthy()
		expect(store.meshState.sliceBlob.name).toMatch(/prepared\.stl$/)
		expect(store.meshState.appliedAt).toBeTruthy()
		expect(viewport.exportTransformedMesh).toHaveBeenCalled()
		expect(store.sliceModelFile()?.name).toMatch(/prepared\.stl$/)
	})

	it('persists profile selection and mesh transform to localStorage', () => {
		const store = usePrintStore()
		store.selection.printerId = 'p1'
		store.selection.filamentId = 'f1'
		store.selection.processId = 'q1'
		store.onProfileChange()
		store.meshState.position = [5, 5, 0]
		store.meshState.rotation = [0, 0, 1.57]
		store.meshState.dirty = true
		store.model.name = 'part.stl'
		store._persistMeshTransform()

		const prefs = JSON.parse(localStorage.getItem(PREFS_KEY))
		expect(prefs.printerId).toBe('p1')
		expect(prefs.filamentId).toBe('f1')
		expect(prefs.processId).toBe('q1')
		expect(prefs.meshTransform.position).toEqual([5, 5, 0])
		expect(prefs.meshTransform.dirty).toBe(true)
		expect(prefs.meshTransform.modelName).toBe('part.stl')
	})

	it('restorePrefs reloads profiles and mesh transform metadata', () => {
		localStorage.setItem(PREFS_KEY, JSON.stringify({
			printerId: 'printer-a',
			filamentId: 'filament-b',
			processId: 'process-c',
			overrides: { layerHeight: '0.2' },
			meshTransform: {
				position: [3, 4, 0],
				rotation: [0, 0, 0.5],
				scale: [1, 1, 1],
				dirty: true,
				autoApply: false,
				modelName: 'saved.stl',
			},
			lastJobId: 'job-123',
			recentModels: [{ name: 'a.stl', size: 100, source: 'import', at: '2026-01-01T00:00:00.000Z' }],
		}))

		const store = usePrintStore()
		store.model.name = 'saved.stl'
		store.restorePrefs()

		expect(store.selection.printerId).toBe('printer-a')
		expect(store.selection.filamentId).toBe('filament-b')
		expect(store.selection.processId).toBe('process-c')
		expect(store.overrides.layerHeight).toBe('0.2')
		expect(store.meshState.position).toEqual([3, 4, 0])
		expect(store.meshState.dirty).toBe(true)
		expect(store.meshState.autoApply).toBe(false)
	})

	it('rememberRecentModel caps list at five entries', () => {
		const store = usePrintStore()
		for (let i = 0; i < 7; i++) {
			store._rememberRecentModel(makeFile(`m${i}.stl`), 'import')
		}
		const prefs = JSON.parse(localStorage.getItem(PREFS_KEY))
		expect(prefs.recentModels).toHaveLength(5)
		expect(prefs.recentModels[0].name).toBe('m6.stl')
	})
})
