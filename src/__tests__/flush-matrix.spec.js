/**
 * @vitest-environment node
 * Source-regex guards for the v1.69 AMS flush matrix: adapter endpoint over the
 * existing flush model, proxy allowlist, and the multi-material-gated panel.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const adapter = read('../../slicer/adapter/main.py')
const proxy = read('../../lib/Controller/SlicerProxyController.php')
const panel = read('../components/FlushMatrixPanel.vue')
const picker = read('../components/MultiToolFilamentPicker.vue')

describe('AMS flush matrix (v1.69) — source', () => {
	it('adapter adds /api/flush/matrix over build_matrix (no new math)', () => {
		expect(adapter).toMatch(/\/api\/flush\/matrix/)
		expect(adapter).toMatch(/build_matrix\(colors\)/)
		expect(adapter).toMatch(/flush_grams/)
		expect(proxy).toMatch(/'api\/flush'/) // allowlisted
	})

	it('FlushMatrixPanel is gated behind extruderCount > 1 (zero single-mat regression)', () => {
		expect(panel).toMatch(/extruderCount > 1/)
		expect(panel).toMatch(/v-if="show"/)
		expect(panel).toMatch(/fetchFlushMatrix/)
		// degrades on a 404 (older sidecar)
		expect(panel).toMatch(/unavailable/)
	})

	it('the multi-tool picker hosts the flush panel', () => {
		expect(picker).toMatch(/FlushMatrixPanel/)
	})
})
