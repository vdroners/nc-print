/**
 * @vitest-environment node
 * Source-regex checks for the v1.59.0 workflow alignment: a persistent estimate
 * (time/filament/cost) + one-click Slice surfaced on the Prepare tab via
 * SliceSummaryCard, reusing the existing slice action + estimate helpers.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const card = read('../components/SliceSummaryCard.vue')

describe('workflow alignment (v1.59.0)', () => {
	it('SliceSummaryCard surfaces a persistent estimate (last slice or a band)', () => {
		expect(card).toMatch(/lastCompletedSliceStats/)
		expect(card).toMatch(/estimatePrintTimeBand/)
		expect(card).toMatch(/formatPrintTime/)
		// shows time/filament/cost rows
		expect(card).toMatch(/Print time/)
		expect(card).toMatch(/Filament/)
		expect(card).toMatch(/Est\. cost/)
	})

	it('SliceSummaryCard has a one-click Slice that reuses the store action', () => {
		expect(card).toMatch(/Slice now/)
		// reuse the existing slice orchestration — not a re-implementation.
		expect(card).toMatch(/printStore\.sliceOnly\(/)
		expect(card).toMatch(/AbortController/)
		// cancel path + disabled gating
		expect(card).toMatch(/cancelSlice/)
		expect(card).toMatch(/sliceDisabled/)
	})
})
