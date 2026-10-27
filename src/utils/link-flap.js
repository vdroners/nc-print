/**
 * Weak-Wi-Fi flap detector.
 *
 * Moonraker on a poor hop (lab K1 Max ~−73 dBm) drops for a few seconds while
 * the camera still works. Count brief online→offline edges so the UI can say
 * the Offline is the link, not a dead printer.
 *
 * A drop counts as soon as it happens. If that spell is still down after
 * `briefOfflineMs`, it is an outage and is removed. Repeated offline samples
 * while already down are one drop. The banner auto-clears after `stableMs`
 * continuously online, and drops older than `windowMs` age out.
 *
 * Dismiss hides the current episode only. The next time flapping goes from
 * false to true, a new episode shows the banner again.
 */

export const LINK_FLAP_DEFAULTS = Object.freeze({
	windowMs: 120_000,
	briefOfflineMs: 30_000,
	minDisconnects: 2,
	stableMs: 60_000,
})

export const LINK_FLAP_BANNER_TEXT = 'Printer Wi‑Fi weak — status may flap'

export function emptyLinkFlap() {
	return {
		visible: false,
		flapping: false,
		recentDisconnects: 0,
		lastSuccessAgeMs: null,
		episode: 0,
	}
}

/**
 * @param {number|null|undefined} ms
 * @returns {string}
 */
export function formatLastSuccess(ms) {
	if (ms == null || !Number.isFinite(ms) || ms < 0) {
		return ''
	}
	if (ms < 2000) {
		return 'last status just now'
	}
	if (ms < 60_000) {
		return `last status ${Math.round(ms / 1000)}s ago`
	}
	const mins = Math.max(1, Math.round(ms / 60_000))
	return mins === 1 ? 'last status 1m ago' : `last status ${mins}m ago`
}

/**
 * Detail line under the banner headline.
 * @param {{ recentDisconnects?: number, lastSuccessAgeMs?: number|null }} [snap]
 * @returns {string}
 */
export function linkFlapDetail(snap = {}) {
	const n = Number(snap.recentDisconnects) || 0
	const drops = n === 1 ? '1 brief drop' : `${n} brief drops`
	const age = formatLastSuccess(snap.lastSuccessAgeMs)
	return age ? `${drops} · ${age}` : drops
}

/**
 * @param {Partial<typeof LINK_FLAP_DEFAULTS>} [options]
 */
export function createLinkFlapTracker(options = {}) {
	const windowMs = options.windowMs ?? LINK_FLAP_DEFAULTS.windowMs
	const briefOfflineMs = options.briefOfflineMs ?? LINK_FLAP_DEFAULTS.briefOfflineMs
	const minDisconnects = options.minDisconnects ?? LINK_FLAP_DEFAULTS.minDisconnects
	const stableMs = options.stableMs ?? LINK_FLAP_DEFAULTS.stableMs

	let sawSample = false
	let connected = false
	let offlineSince = null
	let onlineSince = null
	let lastSuccessAt = null
	let openId = null
	let seq = 1
	/** @type {{ id: number, at: number }[]} */
	const flaps = []
	let episode = 0
	let flapping = false
	let dismissedEpisode = 0

	function prune(now) {
		for (let i = flaps.length - 1; i >= 0; i--) {
			if (now - flaps[i].at > windowMs) {
				flaps.splice(i, 1)
			}
		}
	}

	function retractOpen() {
		if (openId == null) {
			return
		}
		const id = openId
		openId = null
		const idx = flaps.findIndex((f) => f.id === id)
		if (idx >= 0) {
			flaps.splice(idx, 1)
		}
	}

	function expireOpenIfLong(now) {
		if (openId != null && offlineSince != null && (now - offlineSince) > briefOfflineMs) {
			retractOpen()
		}
	}

	function recompute(now) {
		expireOpenIfLong(now)
		const stable = connected && onlineSince != null && (now - onlineSince) >= stableMs
		if (stable) {
			flaps.length = 0
			openId = null
		}
		prune(now)
		const next = flaps.length >= minDisconnects
		if (next && !flapping) {
			episode += 1
		}
		flapping = next
	}

	function buildSnapshot(now) {
		return {
			visible: flapping && episode !== dismissedEpisode,
			flapping,
			recentDisconnects: flaps.length,
			lastSuccessAgeMs: lastSuccessAt == null ? null : Math.max(0, now - lastSuccessAt),
			episode,
			connected,
		}
	}

	return {
		/**
		 * @param {boolean} isConnected
		 * @param {number} [now]
		 */
		note(isConnected, now = Date.now()) {
			const up = !!isConnected
			if (!sawSample) {
				sawSample = true
				connected = up
				if (up) {
					lastSuccessAt = now
					onlineSince = now
				} else {
					offlineSince = now
				}
				recompute(now)
				return buildSnapshot(now)
			}

			if (up) {
				lastSuccessAt = now
				if (!connected) {
					if (offlineSince != null && (now - offlineSince) > briefOfflineMs) {
						retractOpen()
					} else {
						openId = null
					}
					offlineSince = null
					onlineSince = now
				}
				connected = true
			} else if (connected) {
				offlineSince = now
				onlineSince = null
				connected = false
				const id = seq++
				openId = id
				flaps.push({ id, at: now })
			}

			recompute(now)
			return buildSnapshot(now)
		},

		/**
		 * Advance the clock without a new connectivity sample (window expiry,
		 * long-outage retract, stable clear).
		 * @param {number} [now]
		 */
		tick(now = Date.now()) {
			recompute(now)
			return buildSnapshot(now)
		},

		/**
		 * Hide the current episode until flapping stops and starts again.
		 * @param {number} [now]
		 */
		dismiss(now = Date.now()) {
			if (episode > 0) {
				dismissedEpisode = episode
			}
			return buildSnapshot(now)
		},

		reset() {
			sawSample = false
			connected = false
			offlineSince = null
			onlineSince = null
			lastSuccessAt = null
			openId = null
			flaps.length = 0
			episode = 0
			flapping = false
			dismissedEpisode = 0
		},

		/**
		 * @param {number} [now]
		 */
		snapshot(now = Date.now()) {
			return buildSnapshot(now)
		},
	}
}
