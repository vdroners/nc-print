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
		expect(eo.currentObject).toBe('part_1')
		expect(eo.excludedCount).toBe(1)
	})

	it('handles an empty / missing exclude_object', () => {
		const eo = parseExcludeObjects({ status: {} })
		expect(eo.objects).toEqual([])
		expect(eo.currentObject).toBeNull()
	})
})
