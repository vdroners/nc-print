import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const viewport = read('../three/viewport.js')
const modelViewport = read('../components/ModelViewport.vue')

// Source-level guards for the Phase 3b multi-object viewport. The Three.js
// viewport isn't unit-mounted (repo convention), so we lock in the invariants
// that keep the gizmo lifecycle safe + the selection API present.
describe('viewport multi-object (3b) — source invariants', () => {
	it('holds an objects array + selected alias, not just a single mesh', () => {
		expect(viewport).toMatch(/const objects = \[\]/)
		expect(viewport).toMatch(/let selectedId/)
	})

	it('exposes the selection + multi-object API on the handle', () => {
		for (const fn of ['pickObjectAt', 'selectObject', 'deselect', 'getSelectedId',
			'setSelectionChangeHandler', 'listObjects', 'removeObject',
			'duplicateSelected', 'exportAllObjects']) {
			expect(viewport, `handle should expose ${fn}`).toMatch(new RegExp(`\\b${fn}\\b`))
		}
	})

	it('routes gizmo attach through the single selectObjectById path', () => {
		// gizmo.attach should appear inside selectObjectById (+ the legacy add path
		// via ensureGizmo). The key: detachGizmo() runs before the alias moves.
		expect(viewport).toMatch(/function selectObjectById/)
		const fn = viewport.match(/function selectObjectById[\s\S]*?\n\t\}/)
		expect(fn).not.toBeNull()
		expect(fn[0]).toMatch(/detachGizmo\(\)/)
		expect(fn[0]).toMatch(/gizmo\.attach\(modelMesh\)/)
	})

	it('removeObjectById detaches the gizmo before disposing the mesh', () => {
		const fn = viewport.match(/function removeObjectById[\s\S]*?\n\t\}/)
		expect(fn).not.toBeNull()
		const detachIdx = fn[0].indexOf('detachGizmo()')
		const disposeIdx = fn[0].indexOf('.geometry.dispose()')
		expect(detachIdx).toBeGreaterThanOrEqual(0)
		expect(disposeIdx).toBeGreaterThan(detachIdx) // detach precedes dispose
	})

	it('ModelViewport syncs the store scene from the viewport (id lockstep)', () => {
		expect(modelViewport).toMatch(/_syncSceneFromViewport/)
		expect(modelViewport).toMatch(/setSelectionChangeHandler/)
		expect(modelViewport).toMatch(/pickObjectAt/)
	})
})

describe('viewport multi-select tint (v1.63) — source invariants', () => {
	it('exposes setMultiSelection but the gizmo still routes through single-select', () => {
		expect(viewport).toMatch(/setMultiSelection\(ids\)/)
		expect(viewport).toMatch(/const multiIds = new Set/)
		// gizmo attach is NEVER wired to a group — still only in selectObjectById.
		expect(viewport).not.toMatch(/setMultiSelection[\s\S]{0,200}gizmo\.attach/)
	})

	it('applyHighlight precedence is out-of-bed > anchor > multi > flat', () => {
		const fn = viewport.match(/function applyHighlight[\s\S]*?\n\t\}/)
		expect(fn).not.toBeNull()
		const body = fn[0]
		const iOut = body.indexOf('outOfBedIds.has(id)')
		const iSel = body.indexOf('id === selectedId')
		const iMulti = body.indexOf('multiIds.has(id)')
		expect(iOut).toBeGreaterThanOrEqual(0)
		expect(iSel).toBeGreaterThan(iOut) // out-of-bed checked first
		expect(iMulti).toBeGreaterThan(iSel) // multi checked after the anchor
	})

	it('ModelViewport mirrors the store multi-selection into the viewport tint', () => {
		expect(modelViewport).toMatch(/multiSelectionIds/)
		expect(modelViewport).toMatch(/setMultiSelection/)
		// batch-delete cleanup: sync prunes selectedObjectIds to live ids
		expect(modelViewport).toMatch(/selectedObjectIds = this\.printStore\.selectedObjectIds\.filter/)
	})
})
