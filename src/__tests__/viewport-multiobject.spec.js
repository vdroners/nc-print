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
