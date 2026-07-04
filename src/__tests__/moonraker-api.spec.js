import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@nextcloud/router', () => ({
	generateUrl: (path) => `https://cloud.example${path}`,
}))

vi.mock('@nextcloud/axios', () => ({
	default: { get: vi.fn(), post: vi.fn() },
}))

global.window = global.window || {}

import { filamentExtrude, moonrakerGet, moonrakerProxyPost, triggerUpdate } from '@/services/moonraker-api.js'
import axios from '@nextcloud/axios'

describe('moonraker-api additions (v1.27.0)', () => {
	beforeEach(() => {
		axios.get.mockReset()
		axios.post.mockReset()
	})

	it('filamentExtrude posts the guarded gcode-action with distance', async () => {
		axios.post.mockResolvedValueOnce({ data: { ok: true } })
		await filamentExtrude(-1, 'k1')
		expect(axios.post).toHaveBeenCalledWith(
			'https://cloud.example/apps/nc_print/api/printer/gcode-action',
			{ action: 'filament_extrude', distance: -1 },
			{ params: { printer_id: 'k1' } },
		)
	})

	it('moonrakerGet reads through the allowlisted proxy (power devices)', async () => {
		axios.get.mockResolvedValueOnce({ data: { result: { devices: [] } } })
		await moonrakerGet('machine/device_power/devices', {}, 'k1')
		expect(axios.get).toHaveBeenCalledWith(
			'https://cloud.example/apps/nc_print/api/moonraker/machine/device_power/devices',
			{ params: { printer_id: 'k1' } },
		)
	})

	it('moonrakerProxyPost toggles a power device on', async () => {
		axios.post.mockResolvedValueOnce({ data: { ok: true } })
		await moonrakerProxyPost('machine/device_power/device?device=PSU&action=on', {}, 'k1')
		expect(axios.post).toHaveBeenCalledWith(
			'https://cloud.example/apps/nc_print/api/moonraker/machine/device_power/device?device=PSU&action=on',
			{},
			{ params: { printer_id: 'k1' } },
		)
	})

	it('moonrakerGet lists webcams', async () => {
		axios.get.mockResolvedValueOnce({ data: { result: { webcams: [{ name: 'chamber' }] } } })
		const res = await moonrakerGet('server/webcams/list', {}, 'k1')
		expect(res.result.webcams[0].name).toBe('chamber')
	})

	it('triggerUpdate posts the target to the guarded update route', async () => {
		axios.post.mockResolvedValueOnce({ data: { ok: true, target: 'moonraker' } })
		await triggerUpdate('moonraker', 'k1')
		expect(axios.post).toHaveBeenCalledWith(
			'https://cloud.example/apps/nc_print/api/update/trigger',
			{ target: 'moonraker' },
			{ params: { printer_id: 'k1' } },
		)
	})
})
