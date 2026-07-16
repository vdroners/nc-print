import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Mock preamble mirrors mesh-state.spec.js so the full store loads.
vi.mock('@/services/toast.js', () => ({
	toastError: vi.fn(), toastSuccess: vi.fn(), toastWarning: vi.fn(), toastInfo: vi.fn(),
}))
vi.mock('@/services/slicer-api.js', () => ({
	fetchProfiles: vi.fn(async () => []), sliceStream: vi.fn(), downloadGcode: vi.fn(),
	uploadAndStart: vi.fn(), cancelSliceJob: vi.fn(),
}))
vi.mock('@/services/moonraker-api.js', () => ({ fetchState: vi.fn(async () => ({})), uploadAndStart: vi.fn() }))
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

const makeFile = (name) => new File(['solid test'], name, { type: 'application/octet-stream' })

describe('scene objects (Phase 3a)', () => {
	beforeEach(() => {
		localStorage.clear()
		setActivePinia(createPinia())
	})

	it('starts with an empty scene', () => {
		const store = usePrintStore()
		expect(store.objects).toEqual([])
		expect(store.selectedObjectId).toBeNull()
		expect(store.selectedObject).toBeNull()
		expect(store.isMultiObject).toBe(false)
	})

	it('loading a model seeds a single selected object mirroring meshState', () => {
		const store = usePrintStore()
		store.setModel(makeFile('cube.stl'), 'import')
		expect(store.objects).toHaveLength(1)
		expect(store.selectedObjectId).toBe(store.objects[0].id)
		expect(store.selectedObject.name).toBe('cube.stl')
		expect(store.selectedObject.position).toEqual(store.meshState.position)
		expect(store.isMultiObject).toBe(false)
	})

	it('addObject appends and selects; isMultiObject flips at 2', () => {
		const store = usePrintStore()
		store.setModel(makeFile('a.stl'), 'import')
		const b = store.addObject({ name: 'b' })
		expect(store.objects).toHaveLength(2)
		expect(store.selectedObjectId).toBe(b.id)
		expect(store.isMultiObject).toBe(true)
	})

	it('selectObject only accepts existing ids or null', () => {
		const store = usePrintStore()
		store.setModel(makeFile('a.stl'), 'import')
		const id = store.objects[0].id
		store.selectObject('nope')
		expect(store.selectedObjectId).toBe(id) // unchanged
		store.selectObject(null)
		expect(store.selectedObjectId).toBeNull()
		store.selectObject(id)
		expect(store.selectedObjectId).toBe(id)
	})

	it('removeObject drops it and reselects a neighbour', () => {
		const store = usePrintStore()
		store.setModel(makeFile('a.stl'), 'import')
		const a = store.objects[0].id
		const b = store.addObject({ name: 'b' }).id
		store.removeObject(b)
		expect(store.objects.map((o) => o.id)).toEqual([a])
		expect(store.selectedObjectId).toBe(a)
	})

	it('duplicateObject clones transform+name with a fresh id, selects the copy', () => {
		const store = usePrintStore()
		store.setModel(makeFile('a.stl'), 'import')
		const src = store.objects[0]
		src.position = [5, 6, 7]
		const copy = store.duplicateObject(src.id)
		expect(copy.id).not.toBe(src.id)
		expect(copy.name).toBe('a.stl copy')
		expect(copy.position).toEqual([5, 6, 7])
		expect(copy.sourceKind).toBe('duplicate')
		expect(store.selectedObjectId).toBe(copy.id)
	})

	it('setMeshTransform mirrors into the selected object (3a single-object sync)', () => {
		const store = usePrintStore()
		store.setModel(makeFile('a.stl'), 'import')
		store.setMeshTransform({ position: [1, 2, 3], rotation: [0, 0, 0], scale: [2, 2, 2] })
		expect(store.selectedObject.position).toEqual([1, 2, 3])
		expect(store.selectedObject.scale).toEqual([2, 2, 2])
	})

	it('clearModel empties the scene', () => {
		const store = usePrintStore()
		store.setModel(makeFile('a.stl'), 'import')
		store.clearModel()
		expect(store.objects).toEqual([])
		expect(store.selectedObjectId).toBeNull()
	})
})

describe('multi-selection (v1.63)', () => {
	beforeEach(() => {
		localStorage.clear()
		setActivePinia(createPinia())
	})

	const threeObjects = () => {
		const store = usePrintStore()
		store.setModel(makeFile('a.stl'), 'import')
		const a = store.objects[0].id
		const b = store.addObject({ name: 'b' }).id
		const c = store.addObject({ name: 'c' }).id
		return { store, a, b, c }
	}

	it('single select keeps selectedObjectIds in sync as [id]', () => {
		const { store, a } = threeObjects()
		store.selectObject(a)
		expect(store.selectedObjectId).toBe(a)
		expect(store.selectedObjectIds).toEqual([a])
		store.selectObject(null)
		expect(store.selectedObjectIds).toEqual([])
	})

	it('ctrl-toggle adds/removes and moves the anchor', () => {
		const { store, a, b, c } = threeObjects()
		store.selectObject(a)
		store.toggleObjectInSelection(c)
		expect(new Set(store.selectedObjectIds)).toEqual(new Set([a, c]))
		expect(store.selectedObjectId).toBe(c) // anchor follows the added id
		store.toggleObjectInSelection(c) // remove it again
		expect(store.selectedObjectIds).toEqual([a])
		expect(store.selectedObjectId).toBe(a)
		// b was never involved
		expect(store.selectedObjectIds).not.toContain(b)
	})

	it('shift-range selects the contiguous span from the anchor (inclusive)', () => {
		const { store, a, b, c } = threeObjects()
		store.selectObject(a)
		store.selectObjectRangeTo(c)
		expect(store.selectedObjectIds).toEqual([a, b, c])
		expect(store.selectedObjectId).toBe(c)
	})

	it('removeObjects batch-deletes but never the last object', () => {
		const { store, a, b, c } = threeObjects()
		// Try to delete all three — one must survive.
		const removed = store.removeObjects([a, b, c])
		expect(removed).toHaveLength(2)
		expect(store.objects).toHaveLength(1)
	})

	it('removeObject prunes the id from the multi-selection', () => {
		const { store, a, b } = threeObjects()
		store.selectObject(a)
		store.toggleObjectInSelection(b)
		store.removeObject(b)
		expect(store.selectedObjectIds).not.toContain(b)
	})
})
