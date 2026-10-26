import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import * as THREE from 'three'
import {
	bedGuidePositions,
	emptyBedFrame,
	plateClipPlanes,
	keptByPlateClip,
	positionsInsidePlate,
} from '@/three/bed-guides.js'

function extent(positions) {
	let minX = Infinity
	let maxX = -Infinity
	let minY = Infinity
	let maxY = -Infinity
	let maxZ = -Infinity
	for (let i = 0; i < positions.length; i += 3) {
		minX = Math.min(minX, positions[i])
		maxX = Math.max(maxX, positions[i])
		minY = Math.min(minY, positions[i + 1])
		maxY = Math.max(maxY, positions[i + 1])
		maxZ = Math.max(maxZ, positions[i + 2])
	}
	return { minX, maxX, minY, maxY, maxZ }
}

describe('bed guide geometry stays inside the plate', () => {
	it('square volume: grid and yellow edges fill the plate and do not pass it', () => {
		const { grid, edges } = bedGuidePositions(220, 220, 250)
		expect(positionsInsidePlate(grid, 220, 220)).toBe(true)
		expect(positionsInsidePlate(edges, 220, 220)).toBe(true)
		expect(extent(grid)).toMatchObject({ minX: 0, maxX: 220, minY: 0, maxY: 220 })
		expect(extent(edges)).toMatchObject({ minX: 0, maxX: 220, minY: 0, maxY: 220, maxZ: 250 })
	})

	it('non-square volume: grid is the plate rectangle, not a square of the long side', () => {
		const bx = 300
		const by = 220
		const { grid, edges } = bedGuidePositions(bx, by, 250)
		expect(positionsInsidePlate(grid, bx, by)).toBe(true)
		expect(positionsInsidePlate(edges, bx, by)).toBe(true)
		const gridBox = extent(grid)
		// The old GridHelper(Math.max(bx, by)) centered on the plate reached
		// y = by/2 + bx/2 = 260, past the bed and toward the top of the view.
		expect(gridBox.maxY).toBe(by)
		expect(gridBox.maxY).toBeLessThan(Math.max(bx, by))
		expect(gridBox.maxX).toBe(bx)
		expect(gridBox.minX).toBe(0)
		expect(gridBox.minY).toBe(0)
		expect(extent(edges).maxZ).toBe(250)
	})

	it('empty-bed camera keeps the volume cage inside the viewport', () => {
		const volumes = [[220, 220, 220], [300, 220, 250], [180, 250, 200]]
		const aspects = [0.7, 1, 1.33, 1.8]
		for (const [bx, by, bz] of volumes) {
			for (const aspect of aspects) {
				const frame = emptyBedFrame(bx, by, bz, { aspect, fovDeg: 40 })
				const camera = new THREE.PerspectiveCamera(40, aspect, 1, 5000)
				camera.up.set(0, 0, 1)
				camera.position.set(...frame.position)
				camera.lookAt(new THREE.Vector3(...frame.target))
				camera.updateMatrixWorld()
				for (const x of [0, bx]) {
					for (const y of [0, by]) {
						for (const z of [0, bz]) {
							const ndc = new THREE.Vector3(x, y, z).project(camera)
							expect(Math.abs(ndc.x), `${bx}x${by}x${bz} @ ${aspect}`).toBeLessThanOrEqual(1)
							expect(Math.abs(ndc.y), `${bx}x${by}x${bz} @ ${aspect}`).toBeLessThanOrEqual(1)
						}
					}
				}
			}
		}
	})

	it('initial square-aspect frame still fits after the canvas gets narrower', () => {
		const [bx, by, bz] = [220, 220, 220]
		const frame = emptyBedFrame(bx, by, bz, { aspect: 1, fovDeg: 40 })
		const camera = new THREE.PerspectiveCamera(40, 0.7, 1, 5000)
		camera.up.set(0, 0, 1)
		camera.position.set(...frame.position)
		camera.lookAt(new THREE.Vector3(...frame.target))
		camera.updateMatrixWorld()
		for (const x of [0, bx]) {
			for (const y of [0, by]) {
				for (const z of [0, bz]) {
					const ndc = new THREE.Vector3(x, y, z).project(camera)
					expect(Math.abs(ndc.x)).toBeLessThanOrEqual(1)
					expect(Math.abs(ndc.y)).toBeLessThanOrEqual(1)
				}
			}
		}
	})

	it('plate clip keeps the cage and drops the old square-grid overhang', () => {
		const bx = 300
		const by = 220
		const planes = plateClipPlanes(bx, by)
		expect(keptByPlateClip([0, 0, 0], planes)).toBe(true)
		expect(keptByPlateClip([bx, by, 250], planes)).toBe(true)
		// Old overhang corner: half = max/2, centered → y = by/2 + bx/2.
		const overhangY = by / 2 + bx / 2
		expect(overhangY).toBeGreaterThan(by)
		expect(keptByPlateClip([bx / 2, overhangY, 0.01], planes)).toBe(false)
		expect(keptByPlateClip([-10, by / 2, 0], planes)).toBe(false)
	})
})

describe('drawBed uses the plate-bounded guides', () => {
	const viewport = readFileSync(path.resolve('src/three/viewport.js'), 'utf8')

	it('clips grid and volume edges instead of a square GridHelper', () => {
		expect(viewport).toMatch(/bedGuidePositions/)
		expect(viewport).toMatch(/plateClipPlanes/)
		expect(viewport).toMatch(/clippingPlanes/)
		expect(viewport).not.toMatch(/GridHelper/)
		expect(viewport).not.toMatch(/Math\.max\(bx,\s*by\)/)
	})
})
