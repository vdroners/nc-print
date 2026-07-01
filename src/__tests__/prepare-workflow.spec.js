import { describe, it, expect } from 'vitest'

function isPrepareComplete(state) {
	return !!state.model.file
		&& !!state.selection.printerId
		&& !!state.selection.filamentId
		&& !!state.selection.processId
}

function sliceBlockReason(state) {
	if (!state.model.file) {
		return 'Load a model on Prepare first'
	}
	if (!state.selection.printerId || !state.selection.filamentId || !state.selection.processId) {
		return 'Select printer, filament, and process on Prepare'
	}
	if (state.appStatus.loaded && state.appStatus.slicer_enabled && !state.appStatus.slicer_ok) {
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

	it('prepareComplete is true when model and all profiles set', () => {
		expect(isPrepareComplete({
			...base,
			model: { file: {} },
			selection: { printerId: 'p1', filamentId: 'f1', processId: 'q1' },
		})).toBe(true)
	})

	it('sliceBlockReason names missing profiles', () => {
		expect(sliceBlockReason({
			...base,
			model: { file: {} },
		})).toMatch(/Select printer/)
	})
})
