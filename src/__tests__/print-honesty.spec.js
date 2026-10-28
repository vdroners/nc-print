/**
 * @vitest-environment node
 * Print honesty: live controls follow machine state, not a leftover filename.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
	formatProgressPercent,
	lastJobMessage,
	panelForceCollapsed,
	printWorkflowSubtitle,
	resolvePanelOpen,
	showIdlePrintGuide,
	showLastJobCard,
	printWorkflowMark,
	showLivePrintControls,
	blockAutoStartAfterUpload,
} from '@/utils/print-honesty.js'

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

function state(partial) {
	return {
		connected: true,
		state: 'standby',
		filename: '',
		progress: 0,
		message: '',
		lastError: '',
		...partial,
	}
}

describe('print workflow subtitle', () => {
	it('rounds progress the same way as the print tab label', () => {
		expect(formatProgressPercent(0.4)).toBe('40%')
		expect(formatProgressPercent(0.004)).toBe('0.4%')
		expect(formatProgressPercent(0)).toBe('0%')
		expect(formatProgressPercent(1)).toBe('100%')
	})

	it('prefers machine state over a leftover gcode filename', () => {
		const filename = 'Door_PA-CF.gcode'
		// Active progress stays on the header chip and the sticky job line.
		expect(printWorkflowSubtitle(state({
			state: 'printing', filename, progress: 0.89,
		}))).toBe('')
		expect(printWorkflowSubtitle(state({
			state: 'paused', filename, progress: 0.89,
		}))).toBe('')
		expect(printWorkflowSubtitle(state({
			state: 'error', filename, progress: 0.4,
		}))).toBe('Error')
		expect(printWorkflowSubtitle(state({
			state: 'standby', filename, progress: 0.4,
		}))).toBe('Idle')
		expect(printWorkflowSubtitle(state({
			state: 'complete', filename, progress: 1,
		}))).toBe('Idle')
		expect(printWorkflowSubtitle(state({
			state: 'cancelled', filename, progress: 0.4,
		}))).toBe('Idle')
		expect(printWorkflowSubtitle(state({
			state: 'canceled', filename, progress: 0.4,
		}))).toBe('Idle')
		expect(printWorkflowSubtitle(state({
			state: 'ready', filename: null,
		}))).toBe('Idle')
	})

	it('says Offline or Reconnecting when disconnected, even with a stale filename', () => {
		expect(printWorkflowSubtitle(state({
			connected: false, state: 'standby', filename: 'door.gcode',
		}))).toBe('Offline')
		expect(printWorkflowSubtitle(state({
			connected: false, state: 'reconnecting', filename: 'door.gcode',
		}))).toBe('Reconnecting')
		expect(printWorkflowSubtitle(state({
			connected: false, state: 'printing', filename: 'door.gcode', progress: 0.5,
		}))).toBe('Offline')
	})

	it('says Checking while the first probe has not settled', () => {
		expect(printWorkflowSubtitle(state({
			connected: false, state: 'checking', filename: 'door.gcode', progress: 0.33,
		}))).toBe('Checking…')
		expect(printWorkflowSubtitle(state({
			connected: false, state: 'checking',
		}), { atMs: 1 })).toBe('Checking…')
	})

	it('blocks start-after-upload during an active job or a checking reload of one', () => {
		expect(blockAutoStartAfterUpload(state({ state: 'printing' }))).toBe(true)
		expect(blockAutoStartAfterUpload(state({ state: 'paused' }))).toBe(true)
		expect(blockAutoStartAfterUpload(state({ state: 'standby' }))).toBe(false)
		expect(blockAutoStartAfterUpload(state({
			connected: false, state: 'checking',
		}), { active: true })).toBe(true)
		expect(blockAutoStartAfterUpload(state({
			connected: false, state: 'checking',
		}), { active: false })).toBe(false)
	})

	it('says Link lost when a last-contact snapshot exists', () => {
		expect(printWorkflowSubtitle(state({
			connected: false, state: 'offline', filename: 'door.gcode',
		}), { atMs: 1 })).toBe('Link lost')
		expect(printWorkflowSubtitle(state({
			connected: false, state: 'reconnecting',
		}), { atMs: 1 })).toBe('Reconnecting')
	})
})

describe('live controls vs last job', () => {
	const active = { isActive: true, isComplete: false, canPause: true, canCancel: true }
	const idle = { isActive: false, isComplete: false, canPause: false, canResume: false, canCancel: false }
	const done = { isActive: false, isComplete: true }

	it('shows Pause/Resume/Cancel only while printing or paused', () => {
		expect(showLivePrintControls(active)).toBe(true)
		expect(showLivePrintControls(idle)).toBe(false)
		expect(showLivePrintControls({ isActive: false })).toBe(false)
	})

	it('shows one last-job card for a connected leftover filename', () => {
		const leftover = state({ state: 'error', filename: 'door.gcode', progress: 0.4, message: 'Heater failed' })
		expect(showLastJobCard(leftover, idle)).toBe(true)
		expect(showLastJobCard(state({ state: 'standby', filename: 'door.gcode', progress: 0.4 }), idle)).toBe(true)
		expect(showLastJobCard(state({ state: 'cancelled', filename: 'door.gcode' }), idle)).toBe(true)
		expect(showLastJobCard(state({ state: 'canceled', filename: 'door.gcode' }), idle)).toBe(true)
		expect(showLivePrintControls(idle)).toBe(false)
	})

	it('hides the last-job card when idle with no filename, while printing, or when complete', () => {
		expect(showLastJobCard(state({ state: 'standby', filename: '' }), idle)).toBe(false)
		expect(showLastJobCard(state({ state: 'standby', filename: null }), idle)).toBe(false)
		expect(showIdlePrintGuide(state({ state: 'standby', filename: '' }), idle)).toBe(true)
		expect(showIdlePrintGuide(state({ state: 'standby', filename: 'door.gcode' }), idle)).toBe(false)
		expect(showLastJobCard(state({ state: 'printing', filename: 'door.gcode' }), active)).toBe(false)
		expect(showLastJobCard(state({ state: 'complete', filename: 'door.gcode' }), done)).toBe(false)
		expect(showLivePrintControls(done)).toBe(false)
	})

	it('does not treat a disconnected stale filename as a last job', () => {
		const offline = state({ connected: false, state: 'standby', filename: 'door.gcode', lastError: 'poll failed' })
		expect(showLastJobCard(offline, idle)).toBe(false)
		expect(showIdlePrintGuide(offline, idle)).toBe(false)
	})

	it('prefers the Klipper message and falls back to transport lastError', () => {
		expect(lastJobMessage(state({
			message: 'Heater failed', lastError: 'poll failed',
		}))).toBe('Heater failed')
		expect(lastJobMessage(state({
			message: '', lastError: 'poll failed',
		}))).toBe('poll failed')
		expect(lastJobMessage(state({ message: '  ', lastError: '' }))).toBe('')
	})
})

describe('idle panel collapse', () => {
	it('forces temperature, motion, and bed mesh closed when not printing', () => {
		expect(panelForceCollapsed('temperature', false)).toBe(true)
		expect(panelForceCollapsed('motion', false)).toBe(true)
		expect(panelForceCollapsed('bedmesh', false)).toBe(true)
		expect(panelForceCollapsed('console', false)).toBe(false)
		expect(panelForceCollapsed('tuning', false)).toBe(false)
	})

	it('lets a saved-open temperature stay available once a job is active', () => {
		expect(panelForceCollapsed('temperature', true)).toBe(false)
		expect(resolvePanelOpen(true, true)).toBe(false)
		expect(resolvePanelOpen(true, false)).toBe(true)
		expect(resolvePanelOpen(false, false)).toBe(false)
	})
})

describe('print tab source gates', () => {
	const tab = read('../components/PrintTab.vue')
	const bar = read('../components/PrintStatusBar.vue')
	const rail = read('../components/WorkspaceRail.vue')
	const banner = read('../components/PrintCompletionBanner.vue')

	it('checks the print step only when the job is complete', () => {
		expect(printWorkflowMark({ isActive: true, isComplete: false })).toBe('busy')
		expect(printWorkflowMark({ isActive: false, isComplete: true })).toBe('done')
		expect(printWorkflowMark({ isActive: false, isComplete: false })).toBe('idle')
		const workflow = read('../components/PrintWorkflowBanner.vue')
		const style = read('../../css/style.scss')
		expect(workflow).toMatch(/printWorkflowMark/)
		expect(workflow).toMatch(/nc-print-workflow__step--busy/)
		expect(workflow).not.toMatch(/isActive\) \{\s*return '✓'/)
		expect(style).toMatch(/nc-print-workflow__step--busy \.nc-print-workflow__num/)
	})

	it('gates the live card and status bar on isActive, not filename', () => {
		expect(tab).toMatch(/showPrintControl\(\) \{\s*return showLivePrintControls\(this\.controls\)/)
		expect(tab).toMatch(/showLastJob\(\) \{\s*return showLastJobCard\(/)
		expect(tab).not.toMatch(/isActive \|\| this\.printStore\.printerState\.filename/)
		expect(tab).not.toMatch(/isActive \|\| !!st\.filename/)
		const visible = bar.match(/visible\(\) \{([\s\S]*?)\n\t\t\},/)
		expect(visible).not.toBeNull()
		expect(visible[1]).toContain('showLivePrintControls')
		expect(visible[1]).not.toMatch(/filename/)
	})

	it('renders Pause, Resume, and Cancel once, on the sticky status bar', () => {
		const monitor = tab.slice(tab.indexOf('#monitor'), tab.indexOf('#rail'))
		expect(monitor).toContain('<PrintStatusBar')
		expect(tab.indexOf('<PrintStatusBar')).toBe(tab.lastIndexOf('<PrintStatusBar'))
		expect(tab).not.toMatch(/>\s*Pause\s*</)
		expect(tab).not.toMatch(/>\s*Resume\s*</)
		expect(tab).not.toMatch(/>\s*Cancel\s*</)
		expect(bar).toMatch(/>\s*Pause\s*</)
		expect(bar).toMatch(/>\s*Resume\s*</)
		expect(bar).toMatch(/>\s*Cancel\s*</)
		expect(bar).toMatch(/v-if="visible"/)
		expect(bar).toMatch(/v-if="!paused"/)
	})

	it('keeps the completion banner as the complete-state card', () => {
		expect(banner).toMatch(/printerControls\.isComplete/)
		expect(tab).toContain('<PrintCompletionBanner')
		expect(tab).toContain('data-last-job-card')
	})

	it('says No stream until a frame has actually loaded', () => {
		expect(tab).toContain('No stream')
		expect(tab).toMatch(/cameraFrameReady && !cameraError/)
		expect(tab).toMatch(/nc-print-camera-panel__frame--pending/)
		expect(tab).toContain('@load="onCameraLoad"')
	})

	it('puts progress or last job, the camera, and E-STOP in the sticky monitor', () => {
		const monitor = tab.slice(tab.indexOf('#monitor'), tab.indexOf('#rail'))
		const main = tab.slice(tab.indexOf('<WorkspaceRail'), tab.indexOf('#monitor'))
		expect(monitor).toContain('PrintStatusBar')
		expect(monitor).toContain('data-last-job-summary')
		expect(monitor).toContain('nc-print-camera-panel')
		expect(monitor).toContain('EmergencyStopButton')
		expect(monitor.indexOf('PrintStatusBar')).toBeLessThan(monitor.indexOf('nc-print-camera-panel'))
		expect(monitor.indexOf('nc-print-camera-panel')).toBeLessThan(monitor.indexOf('EmergencyStopButton'))
		expect(main).not.toContain('EmergencyStopButton')
		expect(main).not.toContain('<PrintStatusBar')
		expect(rail).toMatch(/name="monitor"/)
		expect(rail).toMatch(/top:\s*var\(--nc-print-chrome-h/)
		const narrow = rail.match(/@media \(max-width:\s*1200px\) \{([\s\S]*)$/)
		expect(narrow).not.toBeNull()
		expect(narrow[1]).toMatch(/nc-print-workspace__monitor \{[^}]*position:\s*sticky/)
		expect(narrow[1]).not.toMatch(/position:\s*static/)
	})

	it('collapses temperature, motion, and bed mesh while idle', () => {
		expect(tab).toMatch(/:force-collapsed="panelForceCollapsed\(p\)"/)
		expect(tab).toMatch(/id: 'temperature'/)
		expect(tab).toMatch(/id: 'motion'/)
		expect(tab).toMatch(/id: 'bedmesh'/)
	})
})
