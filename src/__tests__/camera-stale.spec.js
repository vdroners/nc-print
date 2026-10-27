/**
 * @vitest-environment happy-dom
 * Frozen webcam snapshots must be labeled so a hung Moonraker frame is not live.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import Vue from 'vue'
import {
	CAMERA_STALE_MIN_MS,
	cameraSnapshotAgeMs,
	cameraStaleAfterMs,
	formatCameraStaleAge,
	formatCameraStaleLabel,
	isCameraFrameStale,
	useCameraFrame,
} from '@/composables/useCameraFrame.js'

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('camera stale helpers', () => {
	it('waits three polls and at least 8s', () => {
		expect(cameraStaleAfterMs(2000)).toBe(CAMERA_STALE_MIN_MS)
		expect(cameraStaleAfterMs(1000)).toBe(8000)
		expect(cameraStaleAfterMs(5000)).toBe(15000)
		expect(cameraStaleAfterMs(0)).toBe(8000)
		expect(cameraStaleAfterMs(Number.NaN)).toBe(8000)
	})

	it('measures age only after a decoded frame', () => {
		expect(cameraSnapshotAgeMs(0, 10_000)).toBe(0)
		expect(cameraSnapshotAgeMs(5_000, 4_000)).toBe(0)
		expect(cameraSnapshotAgeMs(1_000, 9_000)).toBe(8_000)
	})

	it('is stale only when a good frame is older than the threshold', () => {
		const base = {
			frameReady: true,
			hasError: false,
			lastFrameAt: 1_000,
			now: 9_000,
			staleAfterMs: 8_000,
		}
		expect(isCameraFrameStale(base)).toBe(true)
		expect(isCameraFrameStale({ ...base, now: 8_999 })).toBe(false)
		expect(isCameraFrameStale({ ...base, frameReady: false })).toBe(false)
		expect(isCameraFrameStale({ ...base, hasError: true })).toBe(false)
		expect(isCameraFrameStale({ ...base, lastFrameAt: 0 })).toBe(false)
	})

	it('labels age and the words Camera stale', () => {
		expect(formatCameraStaleAge(0)).toBe('0s')
		expect(formatCameraStaleAge(12_000)).toBe('12s')
		expect(formatCameraStaleAge(60_000)).toBe('1m')
		expect(formatCameraStaleAge(90_000)).toBe('1m 30s')
		expect(formatCameraStaleAge(3_600_000)).toBe('1h')
		expect(formatCameraStaleAge(3_660_000)).toBe('1h 1m')
		expect(formatCameraStaleAge(Number.NaN)).toBe('0s')
		expect(formatCameraStaleLabel(12_000)).toBe('Camera stale · 12s')
	})
})

describe('useCameraFrame stale indicator', () => {
	let OriginalImage
	let failProbes = false
	const start = new Date('2026-10-27T01:00:00Z')

	beforeEach(() => {
		vi.useFakeTimers()
		vi.setSystemTime(start)
		failProbes = false
		OriginalImage = globalThis.Image
		globalThis.Image = class FakeImage {
			constructor() {
				this.naturalWidth = 0
				this.naturalHeight = 0
				this.onload = null
				this.onerror = null
				this._src = ''
			}

			set src(value) {
				this._src = value
				if (!value) {
					return
				}
				if (failProbes) {
					this.onerror?.()
					return
				}
				this.naturalWidth = 640
				this.naturalHeight = 480
				this.onload?.()
			}

			get src() {
				return this._src
			}
		}
	})

	afterEach(() => {
		globalThis.Image = OriginalImage
		vi.useRealTimers()
	})

	function mount(url = 'http://10.0.0.210:8080/?action=snapshot') {
		const Ctor = Vue.extend({
			mixins: [useCameraFrame('streamUrl', 2000)],
			data() {
				return { streamUrl: url }
			},
			render(h) {
				return h('div')
			},
		})
		return new Ctor()
	}

	it('shows a fresh frame after a decoded snapshot', () => {
		const vm = mount()
		expect(vm.cameraFrameReady).toBe(true)
		expect(vm.cameraError).toBe(false)
		expect(vm.cameraStale).toBe(false)
		expect(vm.cameraFrameUrl).toContain('action=snapshot')
		expect(vm.cameraFrameUrl).toContain('&t=')
		vm.$destroy()
	})

	it('uses ? when the snapshot URL has no query', () => {
		const vm = mount('http://10.0.0.210:8080/snapshot')
		expect(vm.cameraFrameUrl).toContain('?t=')
		vm.$destroy()
	})

	it('labels the last frame when snapshots stop arriving', () => {
		const vm = mount()
		const frozen = vm.cameraFrameUrl
		failProbes = true
		vi.advanceTimersByTime(CAMERA_STALE_MIN_MS - 1000)
		expect(vm.cameraStale).toBe(false)
		expect(vm.cameraFrameUrl).toBe(frozen)
		vi.advanceTimersByTime(1000)
		expect(vm.cameraStale).toBe(true)
		expect(vm.cameraError).toBe(false)
		expect(vm.cameraFrameReady).toBe(true)
		expect(vm.cameraFrameUrl).toBe(frozen)
		expect(vm.cameraStaleLabel).toBe('Camera stale · 8s')
		expect(vm.cameraStaleAgeLabel).toBe('8s')
		vm.$destroy()
	})

	it('clears the stale label when a new snapshot decodes', () => {
		const vm = mount()
		failProbes = true
		vi.advanceTimersByTime(CAMERA_STALE_MIN_MS)
		expect(vm.cameraStale).toBe(true)
		failProbes = false
		vi.advanceTimersByTime(2000)
		expect(vm.cameraStale).toBe(false)
		expect(vm.cameraStaleLabel).toBe('')
		expect(vm.cameraFrameUrl).not.toBe('')
		vm.$destroy()
	})

	it('keeps No stream when the first snapshot never arrives', () => {
		failProbes = true
		const vm = mount()
		expect(vm.cameraFrameReady).toBe(false)
		expect(vm.cameraError).toBe(true)
		expect(vm.cameraErrorMessage).toBe('Camera stream unavailable')
		expect(vm.cameraStale).toBe(false)
		vi.advanceTimersByTime(CAMERA_STALE_MIN_MS)
		expect(vm.cameraStale).toBe(false)
		expect(vm.cameraFrameUrl).toBe('')
		vm.$destroy()
	})

	it('drops the stale clock when the camera URL is cleared', async () => {
		const vm = mount()
		failProbes = true
		vi.advanceTimersByTime(CAMERA_STALE_MIN_MS)
		expect(vm.cameraStale).toBe(true)
		vm.streamUrl = ''
		await vm.$nextTick()
		expect(vm.cameraFrameUrl).toBe('')
		expect(vm.cameraStale).toBe(false)
		expect(vm.cameraLastFrameAt).toBe(0)
		vm.$destroy()
	})

	it('retry paints a frame after a failed first load', () => {
		failProbes = true
		const vm = mount()
		expect(vm.cameraError).toBe(true)
		failProbes = false
		vm.retryCamera()
		expect(vm.cameraFrameReady).toBe(true)
		expect(vm.cameraError).toBe(false)
		expect(vm.cameraStale).toBe(false)
		vm.$destroy()
	})
})

describe('camera stale UI wiring', () => {
	const tab = read('../components/PrintTab.vue')
	const modal = read('../components/PrePrintModal.vue')
	const badge = read('../components/CameraStaleBadge.vue')

	it('badge says Camera stale and shows the age', () => {
		expect(badge).toContain('Camera stale')
		expect(badge).toContain('data-camera-stale')
		expect(badge).toContain('ageLabel')
		expect(badge).toMatch(/role="status"/)
		expect(badge).toContain('aria-hidden="true"')
	})

	it('Print camera panel and fullscreen label a stale frame', () => {
		const monitor = tab.slice(tab.indexOf('#monitor'), tab.indexOf('#rail'))
		expect(monitor).toContain('nc-print-camera-panel--stale')
		expect(monitor).toContain('<CameraStaleBadge')
		expect(monitor).toContain(':stale="cameraStale"')
		expect(monitor).toContain(':age-label="cameraStaleAgeLabel"')
		expect(tab).toContain('nc-print-camera-fullscreen__stage')
		const fullscreen = tab.slice(tab.indexOf('nc-print-camera-fullscreen'))
		expect(fullscreen).toContain('<CameraStaleBadge')
		expect(fullscreen).toContain(':stale="cameraStale"')
		expect(tab).toMatch(/cameraFrameReady && !cameraError/)
		expect(tab).toContain('@load="onCameraLoad"')
	})

	it('pre-print preview labels a stale frame', () => {
		expect(modal).toContain('nc-print-camera-panel--stale')
		expect(modal).toContain('<CameraStaleBadge')
		expect(modal).toContain(':stale="cameraStale"')
		expect(modal).toContain(':age-label="cameraStaleAgeLabel"')
		expect(modal).toContain('@load="onCameraLoad"')
	})
})
