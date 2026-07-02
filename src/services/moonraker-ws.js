import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'
import { fetchState as httpFetchState } from './moonraker-api.js'

const WS_RECONNECT_MS = 5000
const WS_FALLBACK_POLL_MS = 3000

/**
 * Fetch a short-lived ws ticket from NC Print (session-bound).
 * @returns {Promise<{ ticket: string, mode: string, expires_in: number }|null>}
 */
export async function fetchWsTicket() {
	try {
		const url = generateUrl('/apps/nc_print/api/ws-ticket')
		const { data } = await axios.get(url)
		return data?.ticket ? data : null
	} catch {
		return null
	}
}

/**
 * Derive Moonraker WebSocket URL from HTTP base or explicit ws_url field.
 * @param {object} printer
 * @returns {string|null}
 */
export function moonrakerWsUrl(printer) {
	if (printer?.moonraker_ws_url) {
		return printer.moonraker_ws_url
	}
	const http = printer?.moonraker_url || ''
	if (!http) {
		return null
	}
	try {
		const u = new URL(http)
		u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
		u.pathname = '/websocket'
		u.search = ''
		u.hash = ''
		return u.toString()
	} catch {
		return null
	}
}

/**
 * Normalize Moonraker printer.objects.notify_status_update payload.
 * @param {object} status
 */
function normalizeProgress(primary, fallback) {
	for (const value of [primary, fallback]) {
		if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) {
			continue
		}
		return value > 1 ? Math.min(1, value / 100) : value
	}
	return 0
}

export function normalizeMoonrakerStatus(status = {}) {
	const printStats = status.print_stats || {}
	const display = status.display_status || {}
	const virtualSdcard = status.virtual_sdcard || {}
	const extruder = status.extruder || {}
	const bed = status.heater_bed || {}
	const fan = status.fan || {}
	const gcodeMove = status.gcode_move || {}
	const toolhead = status.toolhead || {}
	const info = printStats.info || {}
	const state = printStats.state || 'unknown'
	const progress = normalizeProgress(virtualSdcard.progress, display.progress)
	const homingOrigin = toolhead.homing_origin
	return {
		connected: true,
		state,
		message: display.message || '',
		progress,
		extruderTemp: extruder.temperature ?? null,
		extruderTarget: extruder.target ?? null,
		extruderPower: extruder.power ?? null,
		bedTemp: bed.temperature ?? null,
		bedTarget: bed.target ?? null,
		bedPower: bed.power ?? null,
		fanSpeed: fan.speed ?? null,
		speedFactor: gcodeMove.speed_factor ?? null,
		flowFactor: gcodeMove.extrude_factor ?? null,
		zOffset: Array.isArray(homingOrigin) ? (homingOrigin[2] ?? null) : null,
		filename: printStats.filename ?? null,
		printDuration: printStats.print_duration ?? info.print_duration ?? null,
		totalDuration: printStats.total_duration ?? info.total_duration ?? null,
		layer: virtualSdcard.layer ?? null,
		layerCount: virtualSdcard.layer_count ?? null,
		lastError: '',
	}
}

/**
 * Moonraker progress client — prefers WebSocket when reachable, falls back to HTTP polling.
 */
export class MoonrakerWsClient {
	/**
	 * @param {object} opts
	 * @param {(state: object) => void} opts.onState
	 * @param {(err: Error) => void} [opts.onError]
	 */
	constructor({ onState, onError, onGcodeResponse } = {}) {
		this.onState = onState || (() => {})
		this.onError = onError || (() => {})
		this.onGcodeResponse = onGcodeResponse || (() => {})
		this._ws = null
		this._pollTimer = null
		this._reconnectTimer = null
		this._stopped = true
		this._printerId = null
		this._printer = null
		this._usingWs = false
	}

	/**
	 * @param {object} opts
	 * @param {object} [opts.printer] multi_printer entry
	 * @param {string} [opts.printerId]
	 */
	async start({ printer, printerId } = {}) {
		this.stop()
		this._stopped = false
		this._printer = printer || null
		this._printerId = printerId || printer?.id || null

		const wsUrl = moonrakerWsUrl(printer)
		if (wsUrl && typeof WebSocket !== 'undefined') {
			const ticket = await fetchWsTicket()
			const connected = await this._tryWebSocket(wsUrl, ticket?.ticket)
			if (connected) {
				this._usingWs = true
				return
			}
		}
		this._usingWs = false
		this._startHttpPolling()
	}

	stop() {
		this._stopped = true
		this._usingWs = false
		if (this._ws) {
			try {
				this._ws.close()
			} catch {
				// ignore
			}
			this._ws = null
		}
		if (this._pollTimer) {
			clearInterval(this._pollTimer)
			this._pollTimer = null
		}
		if (this._reconnectTimer) {
			clearTimeout(this._reconnectTimer)
			this._reconnectTimer = null
		}
	}

	get usingWebSocket() {
		return this._usingWs
	}

	async _tryWebSocket(wsUrl, ticket) {
		return new Promise((resolve) => {
			let settled = false
			const finish = (ok) => {
				if (settled) {
					return
				}
				settled = true
				resolve(ok)
			}
			try {
				const url = ticket ? `${wsUrl}${wsUrl.includes('?') ? '&' : '?'}ticket=${encodeURIComponent(ticket)}` : wsUrl
				const ws = new WebSocket(url)
				this._ws = ws
				const timeout = setTimeout(() => {
					if (ws.readyState !== WebSocket.OPEN) {
						ws.close()
						finish(false)
					}
				}, 4000)

				ws.onopen = () => {
					clearTimeout(timeout)
					ws.send(JSON.stringify({
						jsonrpc: '2.0',
						method: 'printer.objects.subscribe',
						params: {
							objects: {
								print_stats: null,
								display_status: null,
								virtual_sdcard: null,
								extruder: null,
								heater_bed: null,
								fan: null,
								gcode_move: null,
								toolhead: null,
							},
						},
						id: 1,
					}))
					finish(true)
				}

				ws.onmessage = (ev) => {
					if (this._stopped) {
						return
					}
					try {
						const msg = JSON.parse(ev.data)
						if (msg.method === 'notify_status_update' && msg.params?.[0]) {
							this.onState(normalizeMoonrakerStatus(msg.params[0]))
						} else if (msg.method === 'notify_gcode_response' && Array.isArray(msg.params)) {
							// WS11: live console scrollback. Moonraker broadcasts
							// gcode responses to every connection.
							for (const line of msg.params) {
								if (typeof line === 'string') {
									this.onGcodeResponse(line)
								}
							}
						}
					} catch {
						// ignore malformed frames
					}
				}

				ws.onerror = () => {
					clearTimeout(timeout)
					if (!settled) {
						finish(false)
					}
				}

				ws.onclose = () => {
					this._ws = null
					this._usingWs = false
					if (!this._stopped) {
						this._reconnectTimer = setTimeout(() => {
							void this.start({ printer: this._printer, printerId: this._printerId })
						}, WS_RECONNECT_MS)
					}
				}
			} catch (e) {
				this.onError(e)
				finish(false)
			}
		})
	}

	_startHttpPolling() {
		const poll = async () => {
			if (this._stopped) {
				return
			}
			try {
				const data = await httpFetchState(this._printerId)
				this.onState(data)
			} catch (e) {
				this.onState({
					connected: false,
					state: 'offline',
					message: '',
					progress: 0,
					extruderTemp: null,
					extruderTarget: null,
					extruderPower: null,
					bedTemp: null,
					bedTarget: null,
					bedPower: null,
					fanSpeed: null,
					speedFactor: null,
					flowFactor: null,
					zOffset: null,
					filename: null,
					printDuration: null,
					totalDuration: null,
					layer: null,
					layerCount: null,
					lastError: e?.message || 'Printer poll failed',
				})
			}
		}
		void poll()
		this._pollTimer = setInterval(poll, WS_FALLBACK_POLL_MS)
	}
}
