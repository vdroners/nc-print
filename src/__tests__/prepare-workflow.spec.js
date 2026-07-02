import { describe, it, expect } from 'vitest'
import {
	isPrepareComplete,
	slicerReady,
	sliceBlockReason,
	previewBlocked,
} from '@/utils/workflow-gates.js'

const base = {
	model: { file: null },
	selection: { printerId: '', filamentId: '', processId: '' },
	appStatus: { loaded: true, slicer_enabled: true, slicer_ok: true },
}

describe('prepare workflow gates (G19)', () => {
	it('prepareComplete is false without model and profiles', () => {
		expect(isPrepareComplete(base)).toBe(false)
	})

	it('prepareComplete is true when model, profiles, and slicer are ready', () => {
		expect(isPrepareComplete({
			...base,
			model: { file: {} },
			selection: { printerId: 'p1', filamentId: 'f1', processId: 'q1' },
		})).toBe(true)
	})

	it('prepareComplete is false when slicer is offline', () => {
		expect(isPrepareComplete({
			...base,
			model: { file: {} },
			selection: { printerId: 'p1', filamentId: 'f1', processId: 'q1' },
			appStatus: { loaded: true, slicer_enabled: true, slicer_ok: false },
		})).toBe(false)
	})

	it('sliceBlockReason names missing profiles', () => {
		expect(sliceBlockReason({
			...base,
			model: { file: {} },
		})).toMatch(/Select printer/)
	})

	it('slicerReady is false until status is loaded and healthy', () => {
		expect(slicerReady({
			...base,
			appStatus: { loaded: false, slicer_enabled: true, slicer_ok: true },
		})).toBe(false)
		expect(slicerReady({
			...base,
			appStatus: { loaded: true, slicer_enabled: true, slicer_ok: false },
		})).toBe(false)
		expect(slicerReady(base)).toBe(true)
	})

	it('sliceBlockReason reports slicer offline when profiles and model are ready', () => {
		const ready = {
			...base,
			model: { file: {} },
			selection: { printerId: 'p1', filamentId: 'f1', processId: 'q1' },
		}
		expect(sliceBlockReason({
			...ready,
			appStatus: { loaded: false, slicer_enabled: true, slicer_ok: true },
		})).toMatch(/Checking slicer/)
		expect(sliceBlockReason({
			...ready,
			appStatus: { loaded: true, slicer_enabled: false, slicer_ok: true },
		})).toMatch(/disabled/)
		expect(sliceBlockReason({
			...ready,
			appStatus: { loaded: true, slicer_enabled: true, slicer_ok: false },
		})).toMatch(/offline/)
	})

	// G33a / G32a — preview-skipped blind-slice guard
	it('previewBlocked is true when preview skipped and no slice blob', () => {
		expect(previewBlocked({
			modelMeta: { previewSkipped: true },
			meshState: { sliceBlob: null },
		})).toBe(true)
	})

	it('previewBlocked is false once a slice blob exists (3MF extraction ok)', () => {
		expect(previewBlocked({
			modelMeta: { previewSkipped: true },
			meshState: { sliceBlob: { name: 'x.stl' } },
		})).toBe(false)
	})

	it('sliceBlockReason blocks a preview-skipped model with no mesh', () => {
		const reason = sliceBlockReason({
			...base,
			model: { file: {}, name: 'part.step' },
			selection: { printerId: 'p1', filamentId: 'f1', processId: 'q1' },
			modelMeta: { previewSkipped: true },
			meshState: { sliceBlob: null, dirty: false },
		})
		expect(reason).not.toBe('')
		expect(reason).toMatch(/mesh preview/i)
	})

	it('prepareComplete is false when the mesh preview is unavailable', () => {
		expect(isPrepareComplete({
			...base,
			model: { file: {}, name: 'part.step' },
			selection: { printerId: 'p1', filamentId: 'f1', processId: 'q1' },
			modelMeta: { previewSkipped: true },
			meshState: { sliceBlob: null, dirty: false },
		})).toBe(false)
	})
})
