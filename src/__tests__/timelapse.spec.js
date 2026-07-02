import { describe, it, expect } from 'vitest'
import {
	parseTimelapseList,
	timelapseSupported,
	formatBytes,
} from '@/utils/timelapse.js'

describe('WS16: timelapse', () => {
	// G44a: rendered video list parse (newest first, videos only)
	it('parses a server/files/list timelapse response, newest first', () => {
		const rows = parseTimelapseList({
			result: [
				{ path: 'print_a.mp4', size: 1024, modified: 100 },
				{ path: 'notes.txt', size: 10, modified: 200 },
				{ path: 'print_b.mp4', size: 2048, modified: 300 },
			],
		})
		expect(rows).toHaveLength(2)
		expect(rows[0].filename).toBe('print_b.mp4')
		expect(rows[0].sizeBytes).toBe(2048)
		expect(rows[1].filename).toBe('print_a.mp4')
	})

	it('accepts a bare array and files key', () => {
		expect(parseTimelapseList([{ path: 'x.webm', modified: 1 }])).toHaveLength(1)
		expect(parseTimelapseList({ files: [{ filename: 'y.mkv' }] })).toHaveLength(1)
	})

	it('tolerates empty/garbage payloads', () => {
		expect(parseTimelapseList(null)).toEqual([])
		expect(parseTimelapseList({})).toEqual([])
		expect(parseTimelapseList({ result: [{ path: 'a.gcode' }] })).toEqual([])
	})

	// G44a: hidden when the plugin is not detected
	it('gates on feature detection', () => {
		expect(timelapseSupported({ timelapse: true })).toBe(true)
		expect(timelapseSupported({ timelapse: false })).toBe(false)
		expect(timelapseSupported(null)).toBe(false)
		expect(timelapseSupported(undefined)).toBe(false)
	})

	it('formats byte sizes', () => {
		expect(formatBytes(0)).toBe('—')
		expect(formatBytes(512)).toBe('512 B')
		expect(formatBytes(2048)).toBe('2.0 KB')
		expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
	})
})
