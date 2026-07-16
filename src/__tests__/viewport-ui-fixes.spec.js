/**
 * @vitest-environment node
 * Source guards for two field-of-view fixes:
 *  - the Prepare tool panel caps its height + scrolls instead of clipping off
 *    the bottom of the viewport;
 *  - the ServiceHealthBanner collapses a fault to a compact, expandable chip
 *    (with an inline Retry) rather than a viewport-eating multi-step card.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const toolPanel = read('../components/PrepareToolPanel.vue')
const banner = read('../components/ServiceHealthBanner.vue')

describe('tool panel no longer clips off the bottom', () => {
	it('caps to the viewport height and scrolls', () => {
		// The absolute panel must bound its height to the (position:relative) wrap
		// and scroll overflow, not run off-screen.
		expect(toolPanel).toMatch(/\.nc-print-tool-panel\s*\{[^}]*max-height:\s*calc\(100% - 16px\)/s)
		expect(toolPanel).toMatch(/\.nc-print-tool-panel\s*\{[^}]*overflow-y:\s*auto/s)
	})
})

describe('service-health collapses to a chip', () => {
	it('renders a compact chip that expands to the full recovery stack', () => {
		expect(banner).toMatch(/nc-print-health-chip/)
		expect(banner).toMatch(/expanded/)
		expect(banner).toMatch(/chipSummary/)
		// full ErrorRecoveryCard stack is gated behind expansion
		expect(banner).toMatch(/v-if="expanded"[\s\S]*ErrorRecoveryCard/)
	})

	it('keeps an inline Retry on the chip + only shows when a fault exists', () => {
		expect(banner).toMatch(/primaryRetry/)
		expect(banner).toMatch(/recoveryCards\.length > 0/)
		// summary collapses 3+ faults to "+N more"
		expect(banner).toMatch(/\+ \$\{labels\.length - 1\} more/)
	})
})
