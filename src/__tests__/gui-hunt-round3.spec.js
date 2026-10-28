/** @vitest-environment node */
/**
 * Source contracts for the round-3 Print polish. Behavior lives in the
 * helper specs; this file only checks the templates still wire them.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('GUI hunt round 3 wiring', () => {
	const tab = read('../components/PrintTab.vue')
	const panel = read('../components/PrintPanel.vue')
	const queue = read('../components/QueuePanel.vue')
	const history = read('../components/HistoryPanel.vue')
	const guard = read('../components/PrintGuardPanel.vue')
	const cameras = read('../components/WebcamListPanel.vue')
	const estop = read('../components/EmergencyStopButton.vue')

	it('softens first contact and blocks auto-start during a job', () => {
		expect(tab).toContain('Checking printer')
		expect(tab).toContain('A slow reply is not an offline printer')
		expect(tab).toContain('blockAutoStart')
		expect(tab).toContain('A job is already active')
		expect(tab).toContain(':disabled="blockAutoStart"')
		expect(estop).toContain('emergencyStopDisabled')
	})

	it('keeps open Print panel headers off the pale-green button style', () => {
		expect(panel).toContain('nc-print-panel--open')
		expect(panel).toContain('.nc-print-panel__btn:active')
		expect(panel).toContain('background-color: transparent')
		expect(panel).toContain("--nc-gcs-text-primary")
		expect(panel).toContain("aria-expanded='true'")
	})

	it('keeps the printing badge and names the object on Cancel', () => {
		expect(queue).toContain('formatJobQueueLabel')
		expect(queue).toContain('nc-print-queue__badge')
		expect(queue).toContain('Cancel object ${objectLabel(obj.name)}')
		const nameBlock = queue.slice(queue.indexOf('nc-print-queue__name'), queue.indexOf('nc-print-queue__badge'))
		expect(nameBlock).not.toContain('>printing<')
	})

	it('renders history statuses through the label helper', () => {
		expect(history).toContain('historyStatusLabel')
		expect(history).toContain('historyStatusTone')
		expect(history).toContain('nc-print-history-badge')
		expect(history).not.toContain('>{{ job.status }}<')
	})

	it('shows Print Guard progress from the live printer poll', () => {
		expect(guard).toContain('formatProgressPercent')
		expect(guard).toContain('printerState')
		expect(guard).toContain('virtual_sdcard')
	})

	it('does not claim the Print tab is showing a camera stream', () => {
		expect(cameras).not.toContain('shows that stream')
		expect(cameras).toContain('No stream')
	})
})
