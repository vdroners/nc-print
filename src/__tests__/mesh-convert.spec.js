import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse3mfMesh, convert3mfToStlBuffer, parse3mfTransform, multiplyTransform, transformPoint, list3mfBuildItems } from '../services/mesh-convert.js'

const SERVOHOLD_3MF = '/media/4TB/3dprints/lib_1782856946964_servohold_test.3mf'

describe('mesh-convert 3MF', () => {
	it('parses 3MF transform identity', () => {
		const t = parse3mfTransform('1 0 0 0 1 0 0 0 1 0 0 0')
		expect(transformPoint(t, 1, 2, 3)).toEqual({ x: 1, y: 2, z: 3 })
	})

	it('multiplies transforms', () => {
		const a = parse3mfTransform('1 0 0 0 1 0 0 0 1 10 0 0')
		const b = parse3mfTransform('1 0 0 0 1 0 0 0 1 0 5 0')
		const c = multiplyTransform(a, b)
		expect(transformPoint(c, 0, 0, 0)).toEqual({ x: 10, y: 5, z: 0 })
	})

	it('extracts mesh from Orca/Creality project 3MF', async () => {
		let buf
		try {
			buf = readFileSync(SERVOHOLD_3MF)
		} catch {
			return // skip when fixture absent
		}
		const mesh = await parse3mfMesh(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
		expect(mesh.triangleCount).toBeGreaterThan(100)
		expect(mesh.bbox.x).toBeGreaterThan(0)
		expect(mesh.bbox.y).toBeGreaterThan(0)
		expect(mesh.bbox.z).toBeGreaterThan(0)
	})

	it('converts 3MF to binary STL', async () => {
		let buf
		try {
			buf = readFileSync(SERVOHOLD_3MF)
		} catch {
			return
		}
		const stl = await convert3mfToStlBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
		expect(stl.byteLength).toBeGreaterThan(1000)
		const dv = new DataView(stl)
		const triCount = dv.getUint32(80, true)
		expect(triCount).toBeGreaterThan(100)
		expect(stl.byteLength).toBe(84 + triCount * 50)
	})

	it('lists build items from project 3MF', async () => {
		let buf
		try {
			buf = readFileSync(SERVOHOLD_3MF)
		} catch {
			return
		}
		const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
		const items = await list3mfBuildItems(ab)
		expect(items.length).toBeGreaterThan(0)
		expect(items[0]).toHaveProperty('id')
		expect(items[0]).toHaveProperty('name')
	})
})

describe('viewport STL parse (G18)', () => {
	it('parses minimal ASCII STL with non-zero bbox', async () => {
		const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js')
		const ASCII_STL = `solid nc_print_gate
facet normal 0 0 1
  outer loop
    vertex 0 0 0
    vertex 10 0 0
    vertex 0 10 0
  endloop
endfacet
endsolid nc_print_gate
`
		const loader = new STLLoader()
		const geom = loader.parse(ASCII_STL)
		geom.computeBoundingBox()
		expect(geom.boundingBox).toBeTruthy()
		const size = {
			x: geom.boundingBox.max.x - geom.boundingBox.min.x,
			y: geom.boundingBox.max.y - geom.boundingBox.min.y,
			z: geom.boundingBox.max.z - geom.boundingBox.min.z,
		}
		expect(size.x).toBeGreaterThan(0)
		expect(size.y).toBeGreaterThan(0)
	})
})
