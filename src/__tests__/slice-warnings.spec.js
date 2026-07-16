/**
 * @vitest-environment node
 * Source-regex guards for the v1.67 slice-warnings surface: the store collects
 * adapter stage:'warning' events + exposes a consolidated sliceWarnings getter,
 * and SliceTab hosts the SliceWarningsPanel with jump-to-object.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const store = read('../store/print.js')
const panel = read('../components/SliceWarningsPanel.vue')
const sliceTab = read('../components/SliceTab.vue')

describe('slice warnings (v1.67) — source', () => {
	it('store collects stage:warning events into sliceJob.warnings', () => {
		expect(store).toMatch(/parsed\.stage === 'warning'/)
		expect(store).toMatch(/this\.sliceJob\.warnings\.push\(parsed\.message\)/)
		expect(store).toMatch(/warnings: \[\]/) // defaultSliceJob seeds it
	})

	it('store exposes a consolidated sliceWarnings getter merging the 3 sources', () => {
		expect(store).toMatch(/sliceWarnings\(state\)/)
		expect(store).toMatch(/outOfBedIds/)
		expect(store).toMatch(/meshHealth\.watertight/)
		expect(store).toMatch(/sliceJob\.warnings/)
	})

	it('SliceWarningsPanel renders the getter + jumps to the object', () => {
		expect(panel).toMatch(/sliceWarnings/)
		expect(panel).toMatch(/selectObject\(w\.objectId\)/)
		expect(panel).toMatch(/v-if="warnings\.length"/) // self-hides when empty
	})

	it('SliceTab hosts the warnings panel', () => {
		expect(sliceTab).toMatch(/SliceWarningsPanel/)
	})
})
