import { describe, it, expect } from 'vitest'

function isPrepareComplete(state) {
	const slicerOk = state.appStatus.loaded && state.appStatus.slicer_enabled && state.appStatus.slicer_ok
	return !!state.model.file
		&& !!state.selection.printerId
		&& !!state.selection.filamentId
		&& !!state.selection.processId
		&& slicerOk
}

function slicerReady(state) {
	return state.appStatus.loaded && state.appStatus.slicer_enabled && state.appStatus.slicer_ok
}

function sliceBlockReason(state) {
	if (!state.model.file) {
		return 'Load a model on Prepare first'
	}
	if (!state.selection.printerId || !state.selection.filamentId || !state.selection.processId) {
		return 'Select printer, filament, and process on Prepare'
	}
	if (!state.appStatus.loaded) {
		return 'Checking slicer status…'
	}
	if (!state.appStatus.slicer_enabled) {
		return 'Slicer disabled in Admin settings'
	}
	if (!state.appStatus.slicer_ok) {
		return 'Slicer service offline'
	}
	return ''
}

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
})
