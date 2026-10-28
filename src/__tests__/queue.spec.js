import { describe, it, expect } from 'vitest'
import {
	parseJobQueue,
	reorderQueueIds,
	addToQueueModel,
	removeFromQueueModel,
	parseExcludeObjects,
} from '@/utils/queue.js'

describe('WS13: queue + exclude-object', () => {
	// G41a: queue list model
	it('parses job_queue status', () => {
		const q = parseJobQueue({
			result: {
				queue_state: 'ready',
				queued_jobs: [
					{ job_id: '1', filename: 'a.gcode', time_added: 100 },
					{ job_id: '2', filename: 'b.gcode', time_added: 200 },
				],
			},
		})
		expect(q.state).toBe('ready')
		expect(q.jobs).toHaveLength(2)
		expect(q.jobs[0].jobId).toBe('1')
		expect(q.jobs[1].filename).toBe('b.gcode')
	})

	it('reorders queue ids purely', () => {
		expect(reorderQueueIds(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
		expect(reorderQueueIds(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
		// no-op / out of bounds
		expect(reorderQueueIds(['a', 'b'], 1, 1)).toEqual(['a', 'b'])
		expect(reorderQueueIds(['a', 'b'], 5, 0)).toEqual(['a', 'b'])
	})

	it('adds and removes from the queue model', () => {
		let jobs = addToQueueModel([], ['x.gcode', 'y.gcode'])
		expect(jobs).toHaveLength(2)
		expect(jobs[0].filename).toBe('x.gcode')
		jobs = removeFromQueueModel(jobs, jobs[0].jobId)
		expect(jobs).toHaveLength(1)
		expect(jobs[0].filename).toBe('y.gcode')
	})

	// G41a: exclude list parse
	it('parses exclude_object with excluded state + current object', () => {
		const eo = parseExcludeObjects({
			result: {
				status: {
					exclude_object: {
						objects: [
							{ name: 'part_1', center: [10, 10] },
							{ name: 'part_2', center: [50, 50] },
							{ name: 'part_3', center: [90, 90] },
						],
						excluded_objects: ['part_2'],
						current_object: 'part_1',
					},
				},
			},
		})
		expect(eo.objects).toHaveLength(3)
		expect(eo.objects.find(o => o.name === 'part_2').excluded).toBe(true)
		expect(eo.objects.find(o => o.name === 'part_1').excluded).toBe(false)
		expect(eo.objects.find(o => o.name === 'part_1').center).toEqual([10, 10])
		expect(eo.objects.find(o => o.name === 'part_1').polygon).toBeNull()
		expect(eo.currentObject).toBe('part_1')
		expect(eo.excludedCount).toBe(1)
	})

	it('handles an empty / missing exclude_object', () => {
		const eo = parseExcludeObjects({ status: {} })
		expect(eo.objects).toEqual([])
		expect(eo.currentObject).toBeNull()
	})

	it('keeps polygons and derives a center when Moonraker omits one', () => {
		const eo = parseExcludeObjects({
			result: {
				status: {
					exclude_object: {
						objects: [
							{
								name: 'plate',
								polygon: [[0, 0], [30, 0], [30, 12], [0, 12]],
							},
							{
								name: 'peg',
								center: '80, 40',
								polygon: '[[70,30],[90,30],[90,50],[70,50]]',
							},
						],
						excluded_objects: [],
						current_object: '',
					},
				},
			},
		})
		expect(eo.currentObject).toBeNull()
		const plate = eo.objects[0]
		expect(plate.polygon).toHaveLength(4)
		expect(plate.center[0]).toBeCloseTo(15)
		expect(plate.center[1]).toBeCloseTo(6)
		expect(eo.objects[1].center).toEqual([80, 40])
		expect(eo.objects[1].polygon[0]).toEqual([70, 30])
	})

	it('accepts a name map, flat polygons, and bare name strings', () => {
		const eo = parseExcludeObjects({
			exclude_object: {
				objects: {
					wing: { center: [1, 2, 0], polygon: [0, 0, 4, 0, 4, 2] },
					tab: 'tab',
				},
				excluded_objects: ['tab'],
				current_object: 'wing',
			},
		})
		const wing = eo.objects.find(o => o.name === 'wing')
		const tab = eo.objects.find(o => o.name === 'tab')
		expect(wing.center).toEqual([1, 2])
		expect(wing.polygon).toEqual([[0, 0], [4, 0], [4, 2]])
		expect(tab.excluded).toBe(true)
		expect(tab.polygon).toBeNull()
		expect(eo.currentObject).toBe('wing')
	})
})
