import { describe, it, expect } from 'vitest'
import { printMonitorReachable } from '@/utils/workflow-gates.js'
import { buildReopenList } from '@/utils/reopen.js'

describe('free navigation — Print monitor (G36a)', () => {
	it('is reachable when a printer is connected even if nothing is sliced', () => {
		const state = {
			printerState: { connected: true },
			appStatus: { moonraker_enabled: false },
			sliceJob: { status: 'idle' },
		}
		expect(printMonitorReachable(state)).toBe(true)
	})

	it('is reachable when Moonraker is enabled and a target is configured (not yet connected)', () => {
		expect(printMonitorReachable({
			printerState: { connected: false },
			appStatus: { moonraker_enabled: true },
			config: { multi_printers: [{ id: 'k1' }] },
		})).toBe(true)
		expect(printMonitorReachable({
			printerState: { connected: false },
			appStatus: { moonraker_enabled: true },
			config: { moonraker_configured: true },
		})).toBe(true)
		expect(printMonitorReachable({
			printerState: { connected: false },
			appStatus: { moonraker_enabled: true },
			selectedPrinterId: 'k1',
		})).toBe(true)
	})

	it('is not reachable when Moonraker is enabled but nothing is configured or selected (Wave B)', () => {
		expect(printMonitorReachable({
			printerState: { connected: false },
			appStatus: { moonraker_enabled: true },
			config: { multi_printers: [] },
		})).toBe(false)
	})

	it('is not reachable with no printer connected and Moonraker disabled', () => {
		expect(printMonitorReachable({
			printerState: { connected: false },
			appStatus: { moonraker_enabled: false },
		})).toBe(false)
	})
})

describe('reopen menu list (G36b)', () => {
	const models = [
		{ name: 'bracket.stl', at: 200, fileId: 10 },
		{ name: 'gear.3mf', at: 400, davPath: '/g.3mf' },
	]
	const jobs = [
		{ id: 'j1', modelName: 'old.stl', timestamp: 100, printerId: 'p1' },
		{ id: 'j2', modelName: 'fresh.stl', timestamp: 500, printerId: 'p2' },
	]

	it('merges models + jobs sorted newest first', () => {
		const list = buildReopenList(models, jobs)
		expect(list.map(i => i.at)).toEqual([500, 400, 200, 100])
		expect(list[0]).toMatchObject({ type: 'job', label: 'fresh.stl' })
		expect(list[1]).toMatchObject({ type: 'model', label: 'gear.3mf' })
	})

	it('tags entry type so the menu can route model->load, job->replay', () => {
		const list = buildReopenList(models, jobs)
		const model = list.find(i => i.type === 'model')
		const job = list.find(i => i.type === 'job')
		expect(model.entry).toHaveProperty('name')
		expect(job.entry).toHaveProperty('printerId')
	})

	it('handles empty inputs', () => {
		expect(buildReopenList(undefined, undefined)).toEqual([])
	})
})
