/**
 * Deep-link from Prepare or the command palette into an Overview accordion.
 *
 * Parts Library and Model Forge already load a model back onto Prepare. This
 * only opens the section that holds them. Persistence covers a fresh Overview
 * mount (NcPrintCollapsible reads storage in data()). The focus event covers an
 * Overview that is already on screen. `pendingSectionId` is what a mount that
 * has not happened yet reads, so the new instance can scroll the section into
 * view — the event fires before that instance exists.
 */
import { TABS } from '@/constants/tabs.js'
import { saveCollapsibleState } from '@/utils/collapsible.js'

export const OVERVIEW_LIBRARY_ID = 'overview-library'
export const OVERVIEW_FORGE_ID = 'overview-modelforge'
export const OVERVIEW_FOCUS_EVENT = 'nc-print-focus-overview'

let pendingSectionId = null
/** Section title when the operator arrived from Prepare. Null for a plain Overview visit. */
let pendingReturnLabel = null

/**
 * @param {string} sectionId
 * @returns {string}
 */
function returnLabelFor(sectionId) {
	return sectionId === OVERVIEW_FORGE_ID ? 'Model Forge' : 'Parts Library'
}

/**
 * Switch to Overview and expand one section.
 * `fromPrepare` asks Overview to show Back to Prepare. The chrome Overview
 * button does not set it.
 * @param {{ setActiveTab?: (tab: string) => void }} store
 * @param {string} sectionId `overview-library` or `overview-modelforge`
 * @param {{ fromPrepare?: boolean }} [opts]
 */
export function openOverviewSection(store, sectionId, opts = {}) {
	const fromPrepare = !!opts.fromPrepare
	if (sectionId) {
		saveCollapsibleState(sectionId, true)
		pendingSectionId = sectionId
	}
	if (fromPrepare) {
		pendingReturnLabel = returnLabelFor(sectionId)
	}
	if (store && typeof store.setActiveTab === 'function') {
		store.setActiveTab(TABS.OVERVIEW)
	}
	if (typeof window !== 'undefined' && sectionId) {
		window.dispatchEvent(new CustomEvent(OVERVIEW_FOCUS_EVENT, {
			detail: {
				id: sectionId,
				fromPrepare,
				returnLabel: fromPrepare ? pendingReturnLabel : '',
			},
		}))
	}
}

/**
 * Read and clear the section id waiting for OverviewTab's next mount.
 * @returns {string|null}
 */
export function consumePendingOverviewSection() {
	const id = pendingSectionId
	pendingSectionId = null
	return id
}

/**
 * Read and clear the Back to Prepare label waiting for Overview.
 * @returns {string|null}
 */
export function consumeOverviewReturn() {
	const label = pendingReturnLabel
	pendingReturnLabel = null
	return label
}
