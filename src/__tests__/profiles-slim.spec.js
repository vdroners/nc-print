import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@nextcloud/router', () => ({ generateUrl: (p) => `https://cloud.example${p}` }))
vi.mock('@nextcloud/axios', () => ({ default: { get: vi.fn() } }))
// slicer-api imports moonraker-api (uploadAndStart) — stub to keep it isolated.
vi.mock('@/services/moonraker-api.js', () => ({ uploadAndStart: vi.fn() }))

import { fetchProfiles, fetchProfileSettings } from '@/services/slicer-api.js'
import axios from '@nextcloud/axios'

const base = 'https://cloud.example/apps/nc_print/api/slicer'

describe('profiles slim + lazy settings', () => {
	beforeEach(() => {
		axios.get.mockReset()
	})

	it('fetchProfiles passes an explicit generous timeout (was the 5s-timeout bug)', async () => {
		axios.get.mockResolvedValueOnce({ data: { profiles: [{ id: 'a', name: 'a', kind: 'filament' }] } })
		const out = await fetchProfiles('all')
		expect(out).toHaveLength(1)
		const [url, opts] = axios.get.mock.calls[0]
		expect(url).toBe(`${base}/profiles`)
		expect(opts.params).toEqual({ kind: 'all' })
		expect(opts.timeout).toBeGreaterThanOrEqual(20000)
	})

	it('fetchProfileSettings fetches ONE profile by kind+name with a timeout', async () => {
		axios.get.mockResolvedValueOnce({ data: { settings: { layer_height: '0.2' } } })
		const s = await fetchProfileSettings('process', '0.20mm Standard @X')
		expect(s).toEqual({ layer_height: '0.2' })
		const [url, opts] = axios.get.mock.calls[0]
		expect(url).toBe(`${base}/profile-settings`)
		expect(opts.params).toEqual({ kind: 'process', name: '0.20mm Standard @X' })
		expect(opts.timeout).toBeGreaterThan(0)
	})

	it('fetchProfileSettings returns {} for an empty name (no request)', async () => {
		const s = await fetchProfileSettings('filament', '')
		expect(s).toEqual({})
		expect(axios.get).not.toHaveBeenCalled()
	})

	it('fetchProfileSettings swallows errors → {}', async () => {
		axios.get.mockRejectedValueOnce(new Error('boom'))
		expect(await fetchProfileSettings('filament', 'X')).toEqual({})
	})
})
