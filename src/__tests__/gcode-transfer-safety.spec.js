/**
 * @vitest-environment node
 * Pause, cancel, and emergency stop stay single-shot. Retry is upload/send only.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

function withDocblock(source, startNeedle, endNeedle) {
	const at = source.indexOf(startNeedle)
	const start = source.lastIndexOf('/**', at)
	return source.slice(start === -1 ? at : start, source.indexOf(endNeedle))
}

describe('control-plane actions are not wired to gcode retry', () => {
	it('emergency stop and print pause/cancel do not classify or retry', () => {
		const php = read('../../lib/Controller/PrinterController.php')
		const estop = withDocblock(php, 'function emergencyStop', 'function upload')
		const printAction = withDocblock(php, 'function printAction', 'function emptyState')
		const upload = php.slice(php.indexOf('function upload():'), php.indexOf('function controlGate'))

		expect(estop).toContain('Single-shot')
		expect(estop).not.toContain('MoonrakerTransferFailure')
		expect(estop).not.toContain('retryable')

		expect(printAction).toContain('Single-shot')
		expect(printAction).not.toContain('MoonrakerTransferFailure')
		expect(printAction).not.toContain('retryable')

		expect(upload).toContain('uploadTransportFailureResponse')
	})

	it('the print store retries only the last upload or send', () => {
		const store = read('../store/print.js')
		const control = withDocblock(store, 'async _runPrintControl', 'printPause()')
		expect(control).toContain('Single-shot')
		expect(control).not.toContain('retryLastGcodeTransfer')
		expect(control).not.toContain('classifyGcodeTransferError')

		const estop = read('../components/EmergencyStopButton.vue')
		expect(estop).toContain('Single-shot')
		expect(estop).not.toContain('retryLastGcodeTransfer')
		expect(estop).not.toContain('gcode-transfer-error')
	})
})
