import { describe, it, expect } from 'vitest'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'

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

describe('viewport STL parse (G18)', () => {
	it('parses minimal ASCII STL with non-zero bbox', () => {
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
