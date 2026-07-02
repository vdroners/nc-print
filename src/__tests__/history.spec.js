import { describe, it, expect } from 'vitest'
import {
	parseHistoryTotals,
	parseHistoryList,
	historyStatusBreakdown,
	bestThumbnail,
	thumbnailSrc,
	thumbnailFromMetadata,
} from '@/utils/history.js'

describe('WS15: history + thumbnails', () => {
	// G43a: totals parse
	it('parses history totals from the enveloped payload', () => {
		const payload = {
			result: {
				job_totals: {
					total_jobs: 42,
					total_time: 360000,
					total_print_time: 320000,
					total_filament_used: 125000,
					longest_job: 20000,
					longest_print: 18000,
				},
			},
		}
		const t = parseHistoryTotals(payload)
		expect(t.jobs).toBe(42)
		expect(t.printTimeS).toBe(320000)
		expect(t.filamentMm).toBe(125000)
		expect(t.longestPrintS).toBe(18000)
	})

	it('parses a bare totals object and coerces junk to 0', () => {
		const t = parseHistoryTotals({ total_jobs: 'x', total_print_time: 5 })
		expect(t.jobs).toBe(0)
		expect(t.printTimeS).toBe(5)
	})

	it('parses + sorts the history list newest-first', () => {
		const payload = {
			result: {
				jobs: [
					{ job_id: 'a', filename: 'old.gcode', status: 'completed', start_time: 100, print_duration: 60, filament_used: 500 },
					{ job_id: 'b', filename: 'new.gcode', status: 'cancelled', start_time: 300 },
				],
			},
		}
		const rows = parseHistoryList(payload)
		expect(rows.map(r => r.jobId)).toEqual(['b', 'a'])
		expect(rows[1].printDurationS).toBe(60)
		expect(rows[1].filamentMm).toBe(500)
	})

	it('computes success/fail breakdown', () => {
		const rows = [
			{ status: 'completed' },
			{ status: 'completed' },
			{ status: 'cancelled' },
			{ status: 'error' },
		]
		const b = historyStatusBreakdown(rows)
		expect(b.completed).toBe(2)
		expect(b.cancelled).toBe(1)
		expect(b.error).toBe(1)
		expect(b.total).toBe(4)
		expect(b.successRate).toBeCloseTo(0.5)
	})

	// G43a: thumbnail metadata → data URL
	it('picks the largest thumbnail', () => {
		const best = bestThumbnail([
			{ width: 32, height: 32, data: 'AAAA' },
			{ width: 300, height: 300, data: 'BBBB' },
			{ width: 100, height: 100, data: 'CCCC' },
		])
		expect(best.width).toBe(300)
	})

	it('builds a base64 data URL from an embedded thumbnail', () => {
		const src = thumbnailSrc({ width: 300, height: 300, data: 'AAAA\nBBBB' })
		expect(src).toBe('data:image/png;base64,AAAABBBB')
	})

	it('falls back to a proxied URL when only relative_path is present', () => {
		const src = thumbnailSrc(
			{ width: 300, height: 300, relative_path: '.thumbs/part.png' },
			(p) => `/proxy/${p}`,
		)
		expect(src).toBe('/proxy/.thumbs/part.png')
	})

	it('returns null when a thumbnail has neither data nor path', () => {
		expect(thumbnailSrc({ width: 10, height: 10 })).toBeNull()
		expect(thumbnailSrc(null)).toBeNull()
	})

	it('extracts the best thumbnail from a metadata payload', () => {
		const meta = {
			result: {
				thumbnails: [
					{ width: 48, height: 48, data: 'SMALL' },
					{ width: 400, height: 400, data: 'BIG' },
				],
			},
		}
		expect(thumbnailFromMetadata(meta)).toBe('data:image/png;base64,BIG')
	})
})
