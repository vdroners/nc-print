/**
 * First contact with Moonraker.
 *
 * The Print tab used to paint a confirmed "Printer offline" on the very first
 * frame, and again when one slow probe came back empty. A single miss is
 * "checking". The weak-link last-seen snapshot (in memory, and for this tab
 * in sessionStorage) stays available so a reload during a job does not look
 * like a dead printer.
 */

/** Completed misses with no successful sample before we say Offline. */
export const PROBE_MISSES_BEFORE_OFFLINE = 2

export const LAST_CONTACT_STORAGE_KEY = 'nc_print_last_contact'

/** Drop a stored reading older than this. A refresh during a live job is seconds old. */
export const LAST_CONTACT_MAX_AGE_MS = 30 * 60 * 1000

/**
 * Header chip / workflow step while Moonraker is not connected.
 * @param {string} state
 * @param {object|null} lastContact
 * @returns {string}
 */
export function disconnectedStatusLabel(state, lastContact) {
	const st = String(state || '').trim().toLowerCase()
	if (st === 'reconnecting') {
		return 'Reconnecting'
	}
	if (st === 'checking') {
		return 'Checking…'
	}
	return lastContact ? 'Link lost' : 'Offline'
}

/**
 * Status-chip modifier (without the `nc-print-status-chip--` prefix).
 * @param {string} state
 * @param {object|null} lastContact
 * @returns {string}
 */
export function disconnectedStatusClass(state, lastContact) {
	const st = String(state || '').trim().toLowerCase()
	if (st === 'reconnecting') {
		return 'reconnecting'
	}
	if (st === 'checking') {
		return 'checking'
	}
	return lastContact ? 'link-lost' : 'idle'
}

/**
 * Connection-line word ("3D Printer · checking…").
 * @param {string} state
 * @param {object|null} lastContact
 * @returns {string}
 */
export function disconnectedConnectionWord(state, lastContact) {
	const st = String(state || '').trim().toLowerCase()
	if (st === 'reconnecting') {
		return 'reconnecting…'
	}
	if (st === 'checking') {
		return 'checking…'
	}
	return lastContact ? 'link lost' : 'offline'
}

/**
 * Connection-line class (`is-checking`, `is-link-lost`, `is-offline`).
 * @param {string} state
 * @param {object|null} lastContact
 * @returns {string}
 */
export function disconnectedConnectionClass(state, lastContact) {
	const st = String(state || '').trim().toLowerCase()
	if (st === 'reconnecting') {
		return 'is-reconnecting'
	}
	if (st === 'checking') {
		return 'is-checking'
	}
	return lastContact ? 'is-link-lost' : 'is-offline'
}

/**
 * Fold one disconnected reading into checking / link-lost / offline.
 * Reconnecting is already soft and is left alone. A previous good sample
 * keeps the link-lost payload. The first miss with no sample stays checking.
 *
 * @param {object} incoming
 * @param {{ lastContact?: object|null, probeMisses?: number }} [ctx]
 * @returns {{ probeMisses: number, incoming: object, phase: 'live'|'checking'|'lost'|'offline' }}
 */
export function softenUnconfirmedOffline(incoming, { lastContact = null, probeMisses = 0 } = {}) {
	const next = incoming && typeof incoming === 'object' ? incoming : {}
	if (next.connected) {
		return { probeMisses: 0, incoming: next, phase: 'live' }
	}
	const st = String(next.state || '').trim().toLowerCase()
	if (st === 'reconnecting') {
		return { probeMisses, incoming: next, phase: lastContact ? 'lost' : 'checking' }
	}
	if (lastContact) {
		return { probeMisses, incoming: next, phase: 'lost' }
	}
	const misses = (Number(probeMisses) || 0) + 1
	if (misses < PROBE_MISSES_BEFORE_OFFLINE) {
		return {
			probeMisses: misses,
			phase: 'checking',
			incoming: { ...next, connected: false, state: 'checking' },
		}
	}
	return {
		probeMisses: misses,
		phase: 'offline',
		incoming: {
			...next,
			connected: false,
			state: st && st !== 'checking' ? next.state : 'offline',
		},
	}
}

/**
 * E-STOP stays usable while the first probe has not settled. A confirmed
 * offline or a dropped link still disables it — there is no channel to halt.
 * @param {{ busy?: boolean, connected?: boolean, state?: string }} input
 * @returns {boolean}
 */
export function emergencyStopDisabled({ busy = false, connected = false, state = '' } = {}) {
	if (busy) {
		return true
	}
	if (String(state || '').trim().toLowerCase() === 'checking') {
		return false
	}
	return !connected
}

function storageOrNull(storage) {
	if (storage) {
		return storage
	}
	try {
		return globalThis.sessionStorage || null
	} catch {
		return null
	}
}

/**
 * @param {string} printerId
 * @param {number} [now]
 * @param {Storage|null} [storage]
 * @returns {object|null}
 */
export function readStoredLastContact(printerId, now = Date.now(), storage = null) {
	const store = storageOrNull(storage)
	if (!printerId || !store) {
		return null
	}
	try {
		const raw = JSON.parse(store.getItem(LAST_CONTACT_STORAGE_KEY) || 'null')
		const snap = raw?.byId?.[String(printerId)]
		if (!snap || !Number.isFinite(Number(snap.atMs))) {
			return null
		}
		if (now - Number(snap.atMs) > LAST_CONTACT_MAX_AGE_MS) {
			return null
		}
		return snap
	} catch {
		return null
	}
}

/**
 * @param {string} printerId
 * @param {object|null} snapshot
 * @param {Storage|null} [storage]
 */
export function writeStoredLastContact(printerId, snapshot, storage = null) {
	const store = storageOrNull(storage)
	if (!printerId || !store) {
		return
	}
	try {
		const raw = JSON.parse(store.getItem(LAST_CONTACT_STORAGE_KEY) || 'null')
		const byId = raw?.byId && typeof raw.byId === 'object' ? { ...raw.byId } : {}
		if (snapshot && Number.isFinite(Number(snapshot.atMs))) {
			byId[String(printerId)] = snapshot
		} else {
			delete byId[String(printerId)]
		}
		store.setItem(LAST_CONTACT_STORAGE_KEY, JSON.stringify({ byId }))
	} catch {
		// private mode / quota
	}
}
