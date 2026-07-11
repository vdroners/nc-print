import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@nextcloud/router', () => ({
	generateUrl: (path) => `https://cloud.example${path}`,
}))

import { sliceStreamMulti } from '@/services/slicer-api.js'

// A fetch stub returning a tiny SSE stream that ends with a done event, so
// readSliceSse resolves. We only care about the FormData that was sent.
function fakeSse(doneObj = { job_id: 'j1', estimated_time_s: 10 }) {
	const body = `event: done\ndata: ${JSON.stringify(doneObj)}\n\n`
	const bytes = new TextEncoder().encode(body)
	let sent = false
	return {
		ok: true,
		headers: { get: () => 'text/event-stream' },
		body: {
			getReader() {
				return {
					read() {
						if (sent) {
							return Promise.resolve({ done: true, value: undefined })
						}
						sent = true
						return Promise.resolve({ done: false, value: bytes })
					},
				}
			},
		},
	}
}

function cube() {
	return new Blob([new Uint8Array(84)], { type: 'application/octet-stream' })
}

describe('sliceStreamMulti object_overrides', () => {
	let captured
	beforeEach(() => {
		captured = null
		global.fetch = vi.fn(async (_url, opts) => {
			captured = opts.body
			return fakeSse()
		})
	})

	it('sends object_overrides when at least one object has settings', async () => {
		await sliceStreamMulti({
			models: [{ data: cube(), filename: 'a.stl' }, { data: cube(), filename: 'b.stl' }],
			printerId: 'K1',
			objectOverrides: [{}, { perimeters: 6 }],
		})
		expect(captured).toBeInstanceOf(FormData)
		expect(captured.get('object_overrides')).toBe(JSON.stringify([{}, { perimeters: 6 }]))
	})

	it('omits object_overrides when every object is empty', async () => {
		await sliceStreamMulti({
			models: [{ data: cube(), filename: 'a.stl' }],
			printerId: 'K1',
			objectOverrides: [{}],
		})
		expect(captured.has('object_overrides')).toBe(false)
	})

	it('omits object_overrides when not provided', async () => {
		await sliceStreamMulti({
			models: [{ data: cube(), filename: 'a.stl' }],
			printerId: 'K1',
		})
		expect(captured.has('object_overrides')).toBe(false)
	})

	it('sends arrange=0 when arrange:false (baked multi-object layout preserved)', async () => {
		await sliceStreamMulti({
			models: [{ data: cube(), filename: 'a.stl' }, { data: cube(), filename: 'b.stl' }],
			printerId: 'K1',
			arrange: false,
		})
		expect(captured.get('arrange')).toBe('0')
	})

	it('sends arrange=1 by default (arrange-plate flow)', async () => {
		await sliceStreamMulti({
			models: [{ data: cube(), filename: 'a.stl' }],
			printerId: 'K1',
		})
		expect(captured.get('arrange')).toBe('1')
	})

	it('sends one model part per object', async () => {
		await sliceStreamMulti({
			models: [{ data: cube(), filename: 'x-part1.stl' }, { data: cube(), filename: 'x-part2.stl' }],
			printerId: 'K1',
			arrange: false,
		})
		expect(captured.getAll('model')).toHaveLength(2)
	})
})
