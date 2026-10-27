/**
 * Poll a snapshot URL with cache-bust for live camera panels.
 *
 * A weak link often hangs or drops the snapshot request. Replacing the
 * visible <img> src on every tick then either stalls on the previous JPEG
 * (no @error) or swaps in a broken image. Operators read that frozen
 * picture as live. Probes run on a detached Image; the visible URL changes
 * only after a decode. Once a frame has painted, a miss keeps that frame
 * and cameraStale becomes true after cameraStaleAfterMs (three poll
 * intervals, at least 8s).
 *
 * Pixel comparison is not used. A still bed is live when snapshots keep
 * arriving. This flags "stopped updating" (weak Wi-Fi / Moonraker flap),
 * not a byte-identical JPEG that still returns HTTP 200 on schedule.
 *
 * @param {string|function} urlSource component key or function returning the URL
 * @param {number} [intervalMs]
 */
export const CAMERA_STALE_MISS_POLLS = 3
export const CAMERA_STALE_MIN_MS = 8000
export const CAMERA_FRESHNESS_TICK_MS = 1000

/**
 * @param {number} [intervalMs]
 * @returns {number}
 */
export function cameraStaleAfterMs(intervalMs = 2000) {
	const interval = Number(intervalMs)
	const safe = Number.isFinite(interval) && interval > 0 ? interval : 2000
	return Math.max(safe * CAMERA_STALE_MISS_POLLS, CAMERA_STALE_MIN_MS)
}

/**
 * @param {number} lastFrameAt
 * @param {number} now
 * @returns {number}
 */
export function cameraSnapshotAgeMs(lastFrameAt, now) {
	const last = Number(lastFrameAt) || 0
	const t = Number(now) || 0
	if (!last || !t || t < last) {
		return 0
	}
	return t - last
}

/**
 * @param {{ frameReady?: boolean, hasError?: boolean, lastFrameAt?: number, now?: number, staleAfterMs?: number }} state
 * @returns {boolean}
 */
export function isCameraFrameStale({ frameReady, hasError, lastFrameAt, now, staleAfterMs }) {
	if (!frameReady || hasError || !lastFrameAt) {
		return false
	}
	const threshold = Number(staleAfterMs)
	if (!Number.isFinite(threshold) || threshold <= 0) {
		return false
	}
	return cameraSnapshotAgeMs(lastFrameAt, now) >= threshold
}

/**
 * Short age for the badge, e.g. "12s" or "1m 30s".
 * @param {number} ageMs
 * @returns {string}
 */
export function formatCameraStaleAge(ageMs) {
	const ms = Number(ageMs)
	const sec = Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : 0
	if (sec < 60) {
		return `${sec}s`
	}
	const min = Math.floor(sec / 60)
	const rem = sec % 60
	if (min < 60) {
		return rem ? `${min}m ${rem}s` : `${min}m`
	}
	const hr = Math.floor(min / 60)
	const m = min % 60
	return m ? `${hr}h ${m}m` : `${hr}h`
}

/**
 * @param {number} ageMs
 * @returns {string}
 */
export function formatCameraStaleLabel(ageMs) {
	return `Camera stale · ${formatCameraStaleAge(ageMs)}`
}

export function useCameraFrame(urlSource, intervalMs = 2000) {
	const staleAfterMs = cameraStaleAfterMs(intervalMs)
	return {
		data() {
			return {
				cameraFrameUrl: '',
				// True only after a decoded frame. A URL that never paints
				// stays on the "No stream" placeholder.
				cameraFrameReady: false,
				cameraError: false,
				cameraErrorMessage: '',
				/** Epoch ms of the last decoded snapshot. 0 until the first paint. */
				cameraLastFrameAt: 0,
				/** Ticked so the stale age stays current between loads. */
				cameraNow: 0,
				_cameraTimer: null,
				_cameraFreshTimer: null,
				_cameraProbe: null,
				// No leading underscore: Vue 2 does not proxy `_`/`$` data keys,
				// and the probe generation must increment on the instance.
				cameraProbeGen: 0,
				cameraStaleAfter: staleAfterMs,
			}
		},
		computed: {
			_baseCameraUrl() {
				const src = typeof urlSource === 'function' ? urlSource.call(this) : this[urlSource]
				return src || ''
			},
			cameraStale() {
				return isCameraFrameStale({
					frameReady: this.cameraFrameReady,
					hasError: this.cameraError,
					lastFrameAt: this.cameraLastFrameAt,
					now: this.cameraNow,
					staleAfterMs: this.cameraStaleAfter,
				})
			},
			cameraStaleAgeLabel() {
				if (!this.cameraStale) {
					return ''
				}
				return formatCameraStaleAge(cameraSnapshotAgeMs(this.cameraLastFrameAt, this.cameraNow))
			},
			cameraStaleLabel() {
				if (!this.cameraStale) {
					return ''
				}
				return formatCameraStaleLabel(cameraSnapshotAgeMs(this.cameraLastFrameAt, this.cameraNow))
			},
		},
		watch: {
			_baseCameraUrl: {
				immediate: true,
				handler(url) {
					this._stopCameraPoll()
					this.cameraError = false
					this.cameraErrorMessage = ''
					this.cameraFrameReady = false
					this.cameraLastFrameAt = 0
					this.cameraNow = 0
					this.cameraFrameUrl = ''
					if (!url) {
						return
					}
					this._refreshCameraFrame()
					this._cameraTimer = setInterval(() => this._refreshCameraFrame(), intervalMs)
					this._cameraFreshTimer = setInterval(() => {
						if (this.cameraLastFrameAt) {
							this.cameraNow = Date.now()
						}
					}, CAMERA_FRESHNESS_TICK_MS)
				},
			},
		},
		beforeDestroy() {
			this._stopCameraPoll()
		},
		methods: {
			_refreshCameraFrame() {
				if (!this._baseCameraUrl) {
					return
				}
				const sep = this._baseCameraUrl.includes('?') ? '&' : '?'
				const nextUrl = `${this._baseCameraUrl}${sep}t=${Date.now()}`
				this._probeCameraUrl(nextUrl)
			},
			_abortCameraProbe() {
				const probe = this._cameraProbe
				if (!probe) {
					return
				}
				probe.onload = null
				probe.onerror = null
				// Dropping src aborts the in-flight snapshot so hung probes
				// do not pile up on the printer host connection limit.
				probe.src = ''
				this._cameraProbe = null
			},
			_probeCameraUrl(url) {
				this._abortCameraProbe()
				const generation = ++this.cameraProbeGen
				const probe = new globalThis.Image()
				this._cameraProbe = probe
				probe.onload = () => {
					if (generation !== this.cameraProbeGen) {
						return
					}
					const width = probe.naturalWidth || 0
					const height = probe.naturalHeight || 0
					if (width > 0 && height > 0) {
						this.cameraFrameUrl = url
						this._markCameraFrameFresh()
						return
					}
					this._markCameraProbeFailed()
				}
				probe.onerror = () => {
					if (generation !== this.cameraProbeGen) {
						return
					}
					this._markCameraProbeFailed()
				}
				probe.src = url
			},
			_markCameraFrameFresh() {
				const now = Date.now()
				this.cameraLastFrameAt = now
				this.cameraNow = now
				this.cameraFrameReady = true
				this.cameraError = false
				this.cameraErrorMessage = ''
			},
			_markCameraProbeFailed() {
				// Keep the last decoded snapshot on screen. The freshness
				// tick labels it once it is older than the threshold.
				if (this.cameraLastFrameAt && this.cameraFrameUrl) {
					return
				}
				this.cameraFrameReady = false
				this.cameraError = true
				this.cameraErrorMessage = 'Camera stream unavailable'
			},
			_stopCameraPoll() {
				if (this._cameraTimer) {
					clearInterval(this._cameraTimer)
					this._cameraTimer = null
				}
				if (this._cameraFreshTimer) {
					clearInterval(this._cameraFreshTimer)
					this._cameraFreshTimer = null
				}
				this.cameraProbeGen += 1
				this._abortCameraProbe()
			},
			onCameraLoad(event) {
				const img = event?.target
				const width = img?.naturalWidth || 0
				const height = img?.naturalHeight || 0
				if (width > 0 && height > 0) {
					this._markCameraFrameFresh()
					return
				}
				this._markCameraProbeFailed()
			},
			onCameraError() {
				this._markCameraProbeFailed()
			},
			retryCamera() {
				this.cameraError = false
				this.cameraErrorMessage = ''
				if (!this.cameraLastFrameAt) {
					this.cameraFrameReady = false
				}
				this._refreshCameraFrame()
			},
		},
	}
}
