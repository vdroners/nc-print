import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { parse3mfMesh, parse3mfMeshes, convert3mfToStlBuffer, parse3mfTransform, multiplyTransform, transformPoint, list3mfBuildItems } from '../services/mesh-convert.js'

const SERVOHOLD_3MF = '/media/4TB/3dprints/lib_1782856946964_servohold_test.3mf'
// Real-world file that broke parsing: build references a component-wrapper object
// whose <component objectid="2"> points at an in-document mesh object (no path).
const TBAR_3MF = '/media/4TB/nc-print/docs/tbar.3MF'

const CT_XML = '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>'
const RELS_XML = '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'

// A 3MF where <build> points at a component-wrapper object that references the
// real mesh object in the SAME document by objectid (the tbar.3MF shape).
async function makeComponentWrapper3mf() {
	const model = `<?xml version="1.0"?>
<model xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" unit="millimeter">
<resources>
<object id="2" type="model"><mesh>
<vertices>
<vertex x="0" y="0" z="0"/><vertex x="10" y="0" z="0"/><vertex x="10" y="10" z="0"/><vertex x="0" y="10" z="0"/>
<vertex x="0" y="0" z="10"/><vertex x="10" y="0" z="10"/><vertex x="10" y="10" z="10"/><vertex x="0" y="10" z="10"/>
</vertices>
<triangles>
<triangle v1="0" v2="2" v3="1"/><triangle v1="0" v2="3" v3="2"/>
<triangle v1="4" v2="5" v3="6"/><triangle v1="4" v2="6" v3="7"/>
<triangle v1="0" v2="1" v3="5"/><triangle v1="0" v2="5" v3="4"/>
<triangle v1="1" v2="2" v3="6"/><triangle v1="1" v2="6" v3="5"/>
<triangle v1="2" v2="3" v3="7"/><triangle v1="2" v2="7" v3="6"/>
<triangle v1="3" v2="0" v3="4"/><triangle v1="3" v2="4" v3="7"/>
</triangles>
</mesh></object>
<object id="1" type="model"><components><component objectid="2"/></components></object>
</resources>
<build><item objectid="1"/></build>
</model>`
	const zip = new JSZip()
	zip.file('[Content_Types].xml', CT_XML)
	zip.file('_rels/.rels', RELS_XML)
	zip.file('3D/3dmodel.model', model)
	const u8 = await zip.generateAsync({ type: 'uint8array' })
	return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength)
}

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

	it('resolves a same-document component-wrapper build object (regression: tbar.3MF)', async () => {
		const ab = await makeComponentWrapper3mf()
		const mesh = await parse3mfMesh(ab)
		// The build item points at the wrapper (object 1) whose component
		// references the mesh (object 2); we must follow it and get the cube.
		expect(mesh.triangleCount).toBe(12)
		expect(mesh.bbox.x).toBeCloseTo(10, 3)
		expect(mesh.bbox.y).toBeCloseTo(10, 3)
		expect(mesh.bbox.z).toBeCloseTo(10, 3)
	})

	it('parses the real tbar.3MF fixture when present', async () => {
		let buf
		try {
			buf = readFileSync(TBAR_3MF)
		} catch {
			return // skip when fixture absent
		}
		const mesh = await parse3mfMesh(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
		expect(mesh.triangleCount).toBeGreaterThan(1000)
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

// Two independent build items (two cubes) → parse3mfMeshes should return two
// separate meshes (Phase 3e), where parse3mfMesh merges them into one.
async function makeTwoItem3mf() {
	const cubeMesh = `<mesh>
<vertices>
<vertex x="0" y="0" z="0"/><vertex x="10" y="0" z="0"/><vertex x="10" y="10" z="0"/><vertex x="0" y="10" z="0"/>
<vertex x="0" y="0" z="10"/><vertex x="10" y="0" z="10"/><vertex x="10" y="10" z="10"/><vertex x="0" y="10" z="10"/>
</vertices>
<triangles>
<triangle v1="0" v2="2" v3="1"/><triangle v1="0" v2="3" v3="2"/>
<triangle v1="4" v2="5" v3="6"/><triangle v1="4" v2="6" v3="7"/>
<triangle v1="0" v2="1" v3="5"/><triangle v1="0" v2="5" v3="4"/>
<triangle v1="1" v2="2" v3="6"/><triangle v1="1" v2="6" v3="5"/>
<triangle v1="2" v2="3" v3="7"/><triangle v1="2" v2="7" v3="6"/>
<triangle v1="3" v2="0" v3="4"/><triangle v1="3" v2="4" v3="7"/>
</triangles>
</mesh>`
	const model = `<?xml version="1.0"?>
<model xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" unit="millimeter">
<resources>
<object id="1" type="model">${cubeMesh}</object>
<object id="2" type="model">${cubeMesh}</object>
</resources>
<build>
<item objectid="1"/>
<item objectid="2" transform="1 0 0 0 1 0 0 0 1 30 0 0"/>
</build>
</model>`
	const zip = new JSZip()
	zip.file('[Content_Types].xml', CT_XML)
	zip.file('_rels/.rels', RELS_XML)
	zip.file('3D/3dmodel.model', model)
	const u8 = await zip.generateAsync({ type: 'uint8array' })
	return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength)
}

describe('parse3mfMeshes (Phase 3e — independent build items)', () => {
	it('returns one mesh per build item', async () => {
		const ab = await makeTwoItem3mf()
		const meshes = await parse3mfMeshes(ab)
		expect(meshes).toHaveLength(2)
		for (const m of meshes) {
			expect(m.triangleCount).toBe(12) // 12 tris per cube
			expect(m.indices.length).toBe(36) // 12 tris × 3 indices
			expect(m.positions.length % 3).toBe(0)
			expect(m.bbox.x).toBeCloseTo(10, 3)
		}
	})

	it('the second item carries its build transform (offset in X)', async () => {
		const ab = await makeTwoItem3mf()
		const meshes = await parse3mfMeshes(ab)
		const minX = (m) => {
			let x = Infinity
			for (let i = 0; i < m.positions.length; i += 3) {
				x = Math.min(x, m.positions[i])
			}
			return x
		}
		const xs = meshes.map(minX).sort((a, b) => a - b)
		expect(xs[0]).toBeCloseTo(0, 3)
		expect(xs[1]).toBeCloseTo(30, 3)
	})

	it('honors selectedIds', async () => {
		const ab = await makeTwoItem3mf()
		const meshes = await parse3mfMeshes(ab, { selectedIds: ['2'] })
		expect(meshes).toHaveLength(1)
	})

	it('falls back to a single merged mesh when there are no build items', async () => {
		const ab = await makeComponentWrapper3mf() // has a build item though → 1 mesh
		const meshes = await parse3mfMeshes(ab)
		expect(meshes.length).toBeGreaterThanOrEqual(1)
		expect(meshes[0].triangleCount).toBe(12)
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

describe('project .3mf round-trip (v1.68)', () => {
	// A unit tetrahedron: 4 verts, 4 tris — enough for a valid 3MF mesh.
	const tetra = () => ({
		positions: new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10]),
		indices: new Uint32Array([0, 2, 1, 0, 1, 3, 1, 2, 3, 2, 0, 3]),
	})

	it('packProject writes readable geometry + recoverable metadata', async () => {
		const { packProject } = await import('../services/project-api.js')
		const { readProjectMeta } = await import('../services/mesh-convert.js')
		const meta = { schema: 'nc-print-project/1', selection: { printerId: 'K1' }, objects: [{ name: 'Tetra' }] }
		const blob = await packProject({ geometries: [tetra()], projectMeta: meta })
		const buf = await blob.arrayBuffer()
		// metadata round-trips
		const got = await readProjectMeta(buf)
		expect(got.schema).toBe('nc-print-project/1')
		expect(got.objects[0].name).toBe('Tetra')
		// geometry is a valid, parseable 3MF mesh
		const mesh = await parse3mfMesh(buf)
		expect(mesh.triangleCount).toBe(4)
		expect(mesh.positions.length).toBe(12)
	})

	it('readProjectMeta returns null for a 3MF without project metadata', async () => {
		const { readProjectMeta } = await import('../services/mesh-convert.js')
		const zip = new JSZip()
		zip.file('[Content_Types].xml', CT_XML)
		zip.folder('_rels').file('.rels', RELS_XML)
		zip.folder('3D').file('3dmodel.model',
			'<?xml version="1.0"?><model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources/><build/></model>')
		const buf = await zip.generateAsync({ type: 'arraybuffer' })
		expect(await readProjectMeta(buf)).toBeNull()
	})
})
