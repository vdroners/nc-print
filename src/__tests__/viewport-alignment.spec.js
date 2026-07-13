/**
 * @vitest-environment node
 * Source-regex checks for the v1.58.0 viewport-GUI alignments: a persistent
 * camera view-cube + a scene-tree right-click context menu.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const camcube = read('../components/ViewportCameraCube.vue')
const prepare = read('../components/PrepareTab.vue')
const sceneList = read('../components/SceneObjectList.vue')

describe('viewport alignment (v1.58.0)', () => {
	it('ViewportCameraCube exposes the standard preset views + emits @camera', () => {
		for (const v of ['iso', 'top', 'front', 'right', 'fit']) {
			expect(camcube).toMatch(new RegExp(`id: '${v}'`))
		}
		expect(camcube).toMatch(/\$emit\('camera'/)
	})

	it('PrepareTab mounts the camera cube wired to onCamera', () => {
		expect(prepare).toMatch(/<ViewportCameraCube/)
		expect(prepare).toMatch(/@camera="onCamera"/)
		// persistent (docked) — has an immersive absolute-position rule.
		expect(prepare).toMatch(/--immersive \.nc-print-viewport-camcube \{[\s\S]*?position:\s*absolute/)
	})

	it('SceneObjectList has a right-click context menu with the standard actions', () => {
		expect(sceneList).toMatch(/@contextmenu\.prevent="openMenu/)
		expect(sceneList).toMatch(/nc-print-ctxmenu/)
		for (const a of ['select', 'duplicate', 'center', 'rename', 'delete']) {
			expect(sceneList).toMatch(new RegExp(`menuAction\\('${a}'\\)`))
		}
		// rename goes through the store; delete guards the last object.
		expect(sceneList).toMatch(/renameObject/)
		expect(sceneList).toMatch(/objects\.length <= 1/)
	})

	it('PrepareTab handles the new @center emit from the scene list', () => {
		expect(prepare).toMatch(/@center="onCenterObject"/)
		expect(prepare).toMatch(/onCenterObject\(id\)/)
	})
})
