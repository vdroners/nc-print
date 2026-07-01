import { describe, it, expect } from 'vitest'
import {
	parseSseBlock,
	parseSseChunk,
	flushSseLeftover,
	buildSliceOverrides,
} from '@/services/slicer-utils.js'

describe('parseSseBlock', () => {
	it('parses event and data lines', () => {
		const block = 'event: progress\ndata: {"stage":"slicing","pct":42}'
		expect(parseSseBlock(block)).toEqual({
			event: 'progress',
			data: '{"stage":"slicing","pct":42}',
		})
	})

	it('defaults event to message when omitted', () => {
		expect(parseSseBlock('data: {"ok":true}')).toEqual({
			event: 'message',
			data: '{"ok":true}',
		})
	})

	it('joins multi-line data fields', () => {
		const block = 'event: done\ndata: line1\ndata: line2'
		expect(parseSseBlock(block)).toEqual({
			event: 'done',
			data: 'line1\nline2',
		})
	})
})

describe('parseSseChunk', () => {
	it('extracts complete blocks and keeps leftover tail', () => {
		const chunk = 'event: progress\ndata: {"pct":10}\n\nevent: pro'
		const { leftover, events } = parseSseChunk(chunk)
		expect(leftover).toBe('event: pro')
		expect(events).toHaveLength(1)
		expect(events[0]).toEqual({
			event: 'progress',
			parsed: { pct: 10 },
		})
	})

	it('parses done and error events from a stream chunk', () => {
		const chunk = [
			'event: progress',
			'data: {"stage":"gcode","pct":99}',
			'',
			'event: done',
			'data: {"ok":true,"job_id":"abc123"}',
			'',
			'',
		].join('\n')
		const { events } = parseSseChunk(chunk)
		expect(events.map(e => e.event)).toEqual(['progress', 'done'])
		expect(events[1].parsed.job_id).toBe('abc123')
	})

	it('accumulates across chunks with leftover carry', () => {
		const first = parseSseChunk('event: error\ndata: {"message":"fail"')
		expect(first.events).toHaveLength(0)
		const second = parseSseChunk('}\n\n', first.leftover)
		expect(second.events).toHaveLength(1)
		expect(second.events[0].parsed.message).toBe('fail')
	})
})

describe('flushSseLeftover', () => {
	it('parses a final event block without trailing blank line', () => {
		const leftover = 'event: done\ndata: {"ok":true,"job_id":"job-99"}'
		const events = flushSseLeftover(leftover)
		expect(events).toHaveLength(1)
		expect(events[0].event).toBe('done')
		expect(events[0].parsed.job_id).toBe('job-99')
	})

	it('returns empty array for blank leftover', () => {
		expect(flushSseLeftover('')).toEqual([])
		expect(flushSseLeftover('   \n')).toEqual([])
	})

	it('recovers job_id from progress events in trailing leftover', () => {
		const leftover = 'event: progress\ndata: {"stage":"gcode","pct":99,"job_id":"job-from-progress"}'
		const events = flushSseLeftover(leftover)
		expect(events).toHaveLength(1)
		expect(events[0].event).toBe('progress')
		expect(events[0].parsed.job_id).toBe('job-from-progress')
	})
})

describe('buildSliceOverrides', () => {
	it('maps numeric form fields to slicer override keys', () => {
		const overrides = buildSliceOverrides({
			layerHeight: '0.2',
			lineWidth: '0.45',
			perimeters: '3',
			infillDensity: '20',
			printSpeed: '60',
			firstLayerSpeed: '25',
			nozzleTemp: '210',
			bedTemp: '60',
		})
		expect(overrides).toEqual({
			layer_height: 0.2,
			line_width: 0.45,
			perimeters: 3,
			infill_density: 0.2,
			print_speed: 60,
			first_layer_speed: 25,
			nozzle_temperature: 210,
			bed_temperature: 60,
		})
	})

	it('skips empty fields', () => {
		expect(buildSliceOverrides({ layerHeight: '', nozzleTemp: '200' })).toEqual({
			nozzle_temperature: 200,
		})
	})

	it('treats infill density above 1 as percent', () => {
		expect(buildSliceOverrides({ infillDensity: '15' }).infill_density).toBe(0.15)
		expect(buildSliceOverrides({ infillDensity: '0.25' }).infill_density).toBe(0.25)
	})
})
