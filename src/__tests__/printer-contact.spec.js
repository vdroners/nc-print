import { describe, it, expect } from 'vitest'
import {
	disconnectedConnectionClass,
	disconnectedConnectionWord,
	disconnectedStatusLabel,
	emergencyStopDisabled,
	PROBE_MISSES_BEFORE_OFFLINE,
	readStoredLastContact,
	softenUnconfirmedOffline,
	writeStoredLastContact,
} from '@/utils/printer-contact.js'

function memoryStorage() {
	const map = new Map()
	return {
		getItem: (k) => (map.has(k) ? map.get(k) : null),
		setItem: (k, v) => map.set(k, String(v)),
		removeItem: (k) => map.delete(k),
	}
}

describe('first Moonraker contact', () => {
	it('keeps the first miss as checking and confirms offline on the next', () => {
		const first = softenUnconfirmedOffline(
			{ connected: false, state: 'offline', lastError: 'timeout' },
			{ lastContact: null, probeMisses: 0 },
		)
		expect(first.phase).toBe('checking')
		expect(first.probeMisses).toBe(1)
		expect(first.incoming.state).toBe('checking')
		expect(PROBE_MISSES_BEFORE_OFFLINE).toBe(2)

		const second = softenUnconfirmedOffline(
			{ connected: false, state: 'offline' },
			{ lastContact: null, probeMisses: first.probeMisses },
		)
		expect(second.phase).toBe('offline')
		expect(second.incoming.state).toBe('offline')
	})

	it('does not rewrite a link-lost reading or a reconnect', () => {
		const lost = softenUnconfirmedOffline(
			{ connected: false, state: 'offline', filename: null },
			{ lastContact: { atMs: 1, filename: 'cone.gcode' }, probeMisses: 0 },
		)
		expect(lost.phase).toBe('lost')
		expect(lost.incoming.state).toBe('offline')
		expect(lost.probeMisses).toBe(0)

		const reconnecting = softenUnconfirmedOffline(
			{ connected: false, state: 'reconnecting' },
			{ lastContact: null, probeMisses: 0 },
		)
		expect(reconnecting.incoming.state).toBe('reconnecting')
		expect(reconnecting.probeMisses).toBe(0)
	})

	it('clears the miss count when a sample connects', () => {
		const live = softenUnconfirmedOffline(
			{ connected: true, state: 'printing' },
			{ lastContact: null, probeMisses: 1 },
		)
		expect(live.phase).toBe('live')
		expect(live.probeMisses).toBe(0)
	})

	it('names checking, link lost, and offline separately', () => {
		expect(disconnectedStatusLabel('checking', null)).toBe('Checking…')
		expect(disconnectedStatusLabel('checking', { atMs: 1 })).toBe('Checking…')
		expect(disconnectedStatusLabel('offline', { atMs: 1 })).toBe('Link lost')
		expect(disconnectedStatusLabel('offline', null)).toBe('Offline')
		expect(disconnectedConnectionWord('checking', null)).toBe('checking…')
		expect(disconnectedConnectionClass('checking', null)).toBe('is-checking')
		expect(disconnectedConnectionClass('offline', { atMs: 1 })).toBe('is-link-lost')
	})

	it('leaves E-STOP available while checking', () => {
		expect(emergencyStopDisabled({ busy: false, connected: false, state: 'checking' })).toBe(false)
		expect(emergencyStopDisabled({ busy: true, connected: false, state: 'checking' })).toBe(true)
		expect(emergencyStopDisabled({ busy: false, connected: false, state: 'offline' })).toBe(true)
		expect(emergencyStopDisabled({ busy: false, connected: true, state: 'printing' })).toBe(false)
	})

	it('round-trips a recent last-contact snapshot and drops an old one', () => {
		const storage = memoryStorage()
		const now = 1_700_000_000_000
		writeStoredLastContact('k1', {
			atMs: now - 5000,
			state: 'printing',
			filename: 'cone.gcode',
			progress: 0.33,
			active: true,
		}, storage)
		expect(readStoredLastContact('k1', now, storage).filename).toBe('cone.gcode')
		expect(readStoredLastContact('other', now, storage)).toBeNull()
		expect(readStoredLastContact('k1', now + 31 * 60 * 1000, storage)).toBeNull()
	})
})
