/**
 * @vitest-environment node
 * Source-regex checks for the v1.60.0 preview alignment: color-by-speed +
 * in-layer move slider in Toolpath3D + viewport, and the adapter emitting speeds.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const tp = read('../components/Toolpath3D.vue')
const viewport = read('../three/viewport.js')
const adapter = read('../../slicer/adapter/gcode_toolpath.py')

describe('preview alignment (v1.60.0)', () => {
	it('Toolpath3D has a Color-by Feature|Speed control + gradient legend', () => {
		expect(tp).toMatch(/Color by/)
		expect(tp).toMatch(/setColorMode\('feature'\)/)
		expect(tp).toMatch(/setColorMode\('speed'\)/)
		expect(tp).toMatch(/tp3d__gradient/)
		// speed mode is gated on the sidecar actually emitting a range
		expect(tp).toMatch(/:disabled="!speedRange"/)
	})

	it('Toolpath3D has an in-layer move slider wired to setToolpathMoveRange', () => {
		expect(tp).toMatch(/Moves/)
		expect(tp).toMatch(/onMove\(/)
		expect(tp).toMatch(/setToolpathMoveRange/)
	})

	it('viewport showToolpath takes a colorMode + builds per-vertex speed colors', () => {
		expect(viewport).toMatch(/showToolpath\(toolpath, colorMap = \{\}, colorMode = 'feature'\)/)
		expect(viewport).toMatch(/vertexColors: true/)
		expect(viewport).toMatch(/colorForSpeed/)
		expect(viewport).toMatch(/setToolpathMoveRange\(topLayer, moveCount\)/)
	})

	it('adapter emits per-segment speeds + a speed range', () => {
		expect(adapter).toMatch(/"speeds"/)
		expect(adapter).toMatch(/feed_mm_s = v \/ 60\.0/)
		expect(adapter).toMatch(/speed_min/)
		expect(adapter).toMatch(/speed_max/)
	})
})

describe('preview/viewport A (v1.62)', () => {
	it('viewport exposes a min–max layer band method (keeps the single-cap one)', () => {
		expect(viewport).toMatch(/setToolpathLayerRangeMinMax\(minLayer, maxLayer\)/)
		expect(viewport).toMatch(/setToolpathLayerRange\(maxLayer\)/) // single-cap retained
		// band uses a contiguous draw range (start, count)
		expect(viewport).toMatch(/setDrawRange\(start, end - start\)/)
	})

	it('Toolpath3D has a bottom (min-layer) slider wired to the band method', () => {
		expect(tp).toMatch(/onMinLayer\(/)
		expect(tp).toMatch(/setToolpathLayerRangeMinMax/)
		expect(tp).toMatch(/minLayer: 0/)
	})

	it('viewport tints out-of-bed objects red, with selection taking precedence', () => {
		expect(viewport).toMatch(/outOfBedIds/)
		expect(viewport).toMatch(/refreshOutOfBed/)
		expect(viewport).toMatch(/objectsOutOfBed\(\)/)
		// isOnBed + objectsOutOfBed check the Z-max clause
		expect(viewport).toMatch(/box\.max\.z <= bz \+ 0\.5/)
	})
})

describe('seam/retraction features (v1.64)', () => {
	it('adapter declares seam + retraction feature types and detects them', () => {
		expect(adapter).toMatch(/"seam", "retraction", "travel"/)
		expect(adapter).toMatch(/seam_pending/)
		// retraction = negative delta-E with no XYZ move → a dot
		expect(adapter).toMatch(/elif has_e and delta_e < 0/)
		expect(adapter).toMatch(/_push\("retraction"/)
		expect(adapter).toMatch(/_push\("seam"/)
	})

	it('viewport renders seam/retraction as Points (degenerate dots), hidden set right', () => {
		expect(viewport).toMatch(/POINT_FEATURES = new Set\(\['seam', 'retraction'\]\)/)
		expect(viewport).toMatch(/new THREE\.Points\(geom, mat\)/)
		expect(viewport).toMatch(/HIDDEN_BY_DEFAULT = new Set\(\['travel', 'retraction'\]\)/)
	})
})
