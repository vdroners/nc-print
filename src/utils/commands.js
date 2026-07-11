/**
 * Command registry for the Ctrl+K palette.
 *
 * `buildCommands(store)` returns a flat list of runnable commands built from the
 * current store state. Each command:
 *   { id, title, group, hint?, enabled: boolean, run() }
 * Disabled commands still appear (greyed) so users see what's possible and why
 * it's unavailable. Groups mirror 3DPrintForge: Navigation / Actions / Panels /
 * Printers.
 *
 * Kept as a pure function of the store (+ optional callbacks) so it's testable
 * with a plain mock store. The palette component supplies UI-side callbacks
 * (openImport, focusPanel) via the second arg.
 */
import { TABS } from '@/constants/tabs.js'

/** Panel ids + titles that the palette can jump to / expand (match PrintTab). */
export const PALETTE_PANELS = [
	{ id: 'tuning', title: 'In-print tuning' },
	{ id: 'temperature', title: 'Temperature' },
	{ id: 'motion', title: 'Manual motion' },
	{ id: 'console', title: 'G-code console' },
	{ id: 'power', title: 'Power devices' },
	{ id: 'tempgraph', title: 'Temperature graph' },
	{ id: 'bedmesh', title: 'Bed mesh' },
]

/**
 * @param {object} store the print store
 * @param {{ openImport?: () => void, focusPanel?: (id: string) => void }} [cb]
 * @returns {Array<{id:string,title:string,group:string,hint?:string,enabled:boolean,run:Function}>}
 */
export function buildCommands(store, cb = {}) {
	const cmds = []
	const controls = store.printerControls || {}
	const active = !!controls.isActive
	const paused = (store.printerState?.state || '').toLowerCase() === 'paused'

	// ── Navigation ──────────────────────────────────────────────────────────
	cmds.push({
		id: 'nav-prepare', title: 'Go to Prepare', group: 'Navigation', enabled: true,
		run: () => store.setActiveTab(TABS.PREPARE),
	})
	cmds.push({
		id: 'nav-slice', title: 'Go to Slice', group: 'Navigation',
		enabled: store.prepareComplete, hint: store.prepareComplete ? '' : 'Finish Prepare first',
		run: () => store.setActiveTab(TABS.SLICE),
	})
	cmds.push({
		id: 'nav-print', title: 'Go to Print', group: 'Navigation', enabled: true,
		run: () => store.setActiveTab(TABS.PRINT),
	})

	// ── Actions ─────────────────────────────────────────────────────────────
	if (cb.openImport) {
		cmds.push({
			id: 'act-import', title: 'Import model…', group: 'Actions', hint: 'Ctrl+O', enabled: true,
			run: () => cb.openImport(),
		})
	}
	cmds.push({
		id: 'act-slice', title: 'Slice', group: 'Actions',
		enabled: store.hasModel && !store.sliceBlockReason,
		hint: store.sliceBlockReason || '',
		run: () => { store.setActiveTab(TABS.SLICE); return store.sliceOnly({}) },
	})
	cmds.push({
		id: 'act-slice-send', title: 'Slice & send to printer', group: 'Actions',
		enabled: store.hasModel && !store.sliceBlockReason,
		hint: store.sliceBlockReason || '',
		run: () => { store.setActiveTab(TABS.SLICE); return store.sliceAndSend({}) },
	})
	cmds.push({
		id: 'act-pause', title: 'Pause print', group: 'Actions',
		enabled: active && !paused && !!controls.canPause,
		run: () => store.printPause(),
	})
	cmds.push({
		id: 'act-resume', title: 'Resume print', group: 'Actions',
		enabled: paused && !!controls.canResume,
		run: () => store.printResume(),
	})
	cmds.push({
		id: 'act-cancel', title: 'Cancel print', group: 'Actions',
		enabled: active && !!controls.canCancel,
		run: () => store.printCancel(),
	})

	// ── Panels (jump to Print tab + expand) ─────────────────────────────────
	for (const p of PALETTE_PANELS) {
		cmds.push({
			id: `panel-${p.id}`, title: `Open ${p.title}`, group: 'Panels', enabled: true,
			run: () => {
				store.setActiveTab(TABS.PRINT)
				if (cb.focusPanel) {
					cb.focusPanel(p.id)
				}
			},
		})
	}

	// ── Printers (switch monitored printer) ─────────────────────────────────
	const printers = Array.isArray(store.configuredPrinters) ? store.configuredPrinters : []
	for (const pr of printers) {
		const id = String(pr.id)
		const isCurrent = String(store.selectedPrinterId) === id
		cmds.push({
			id: `printer-${id}`,
			title: `Switch to ${pr.name || id}`,
			group: 'Printers',
			hint: isCurrent ? 'current' : '',
			enabled: !isCurrent,
			run: () => {
				store.selectedPrinterId = id
				if (typeof store.onPrinterTargetChange === 'function') {
					store.onPrinterTargetChange()
				}
			},
		})
	}

	return cmds
}
