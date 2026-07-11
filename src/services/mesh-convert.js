/**
 * Client-side 3MF mesh extraction + binary STL export.
 * Orca/Creality project 3MFs store geometry in linked object files;
 * forge-slicer often fails on those — we flatten to STL before upload.
 */

import JSZip from 'jszip'

const CORE_NS = 'http://schemas.microsoft.com/3dmanufacturing/core/2015/02'
const PROD_NS = 'http://schemas.microsoft.com/3dmanufacturing/production/2015/06'

const IDENTITY = Object.freeze({
	m00: 1, m01: 0, m02: 0,
	m10: 0, m11: 1, m12: 0,
	m20: 0, m21: 0, m22: 1,
	tx: 0, ty: 0, tz: 0,
})

/**
 * @param {string} [str]
 * @returns {typeof IDENTITY}
 */
export function parse3mfTransform(str) {
	const parts = (str || '1 0 0 0 1 0 0 0 1 0 0 0').trim().split(/\s+/).map(Number)
	if (parts.length !== 12 || parts.some(n => !Number.isFinite(n))) {
		return { ...IDENTITY }
	}
	return {
		m00: parts[0], m01: parts[1], m02: parts[2],
		m10: parts[3], m11: parts[4], m12: parts[5],
		m20: parts[6], m21: parts[7], m22: parts[8],
		tx: parts[9], ty: parts[10], tz: parts[11],
	}
}

/**
 * Compose parent * child (apply child first, then parent).
 * @param {typeof IDENTITY} parent
 * @param {typeof IDENTITY} child
 */
export function multiplyTransform(parent, child) {
	return {
		m00: parent.m00 * child.m00 + parent.m01 * child.m10 + parent.m02 * child.m20,
		m01: parent.m00 * child.m01 + parent.m01 * child.m11 + parent.m02 * child.m21,
		m02: parent.m00 * child.m02 + parent.m01 * child.m12 + parent.m02 * child.m22,
		m10: parent.m10 * child.m00 + parent.m11 * child.m10 + parent.m12 * child.m20,
		m11: parent.m10 * child.m01 + parent.m11 * child.m11 + parent.m12 * child.m21,
		m12: parent.m10 * child.m02 + parent.m11 * child.m12 + parent.m12 * child.m22,
		m20: parent.m20 * child.m00 + parent.m21 * child.m10 + parent.m22 * child.m20,
		m21: parent.m20 * child.m01 + parent.m21 * child.m11 + parent.m22 * child.m21,
		m22: parent.m20 * child.m02 + parent.m21 * child.m12 + parent.m22 * child.m22,
		tx: parent.m00 * child.tx + parent.m01 * child.ty + parent.m02 * child.tz + parent.tx,
		ty: parent.m10 * child.tx + parent.m11 * child.ty + parent.m12 * child.tz + parent.ty,
		tz: parent.m20 * child.tx + parent.m21 * child.ty + parent.m22 * child.tz + parent.tz,
	}
}

/**
 * @param {typeof IDENTITY} t
 * @param {number} x
 * @param {number} y
 * @param {number} z
 */
export function transformPoint(t, x, y, z) {
	return {
		x: t.m00 * x + t.m01 * y + t.m02 * z + t.tx,
		y: t.m10 * x + t.m11 * y + t.m12 * z + t.ty,
		z: t.m20 * x + t.m21 * y + t.m22 * z + t.tz,
	}
}

function resolveZipPath(basePath, relPath) {
	const clean = String(relPath || '').replace(/^\//, '')
	if (!basePath || clean.startsWith('3D/')) {
		return clean
	}
	const dir = basePath.includes('/') ? basePath.replace(/\/[^/]+$/, '') : ''
	return dir ? `${dir}/${clean.replace(/^\.\//, '')}` : clean
}

function parseModelXml(text) {
	return new DOMParser().parseFromString(text, 'application/xml')
}

function meshFromObject(objectEl, transform, outPositions, outIndices) {
	const meshEl = objectEl.getElementsByTagNameNS(CORE_NS, 'mesh')[0]
	if (!meshEl) {
		return
	}
	const verts = meshEl.getElementsByTagNameNS(CORE_NS, 'vertex')
	const tris = meshEl.getElementsByTagNameNS(CORE_NS, 'triangle')
	const base = outPositions.length / 3
	const localVerts = []
	for (let i = 0; i < verts.length; i++) {
		const v = verts[i]
		const x = parseFloat(v.getAttribute('x') || '0')
		const y = parseFloat(v.getAttribute('y') || '0')
		const z = parseFloat(v.getAttribute('z') || '0')
		const p = transformPoint(transform, x, y, z)
		localVerts.push(p.x, p.y, p.z)
	}
	for (let i = 0; i < localVerts.length; i++) {
		outPositions.push(localVerts[i])
	}
	for (let i = 0; i < tris.length; i++) {
		const tri = tris[i]
		outIndices.push(
			base + parseInt(tri.getAttribute('v1') || '0', 10),
			base + parseInt(tri.getAttribute('v2') || '0', 10),
			base + parseInt(tri.getAttribute('v3') || '0', 10),
		)
	}
}

/**
 * Build an id→object map for a parsed model document (own resources only).
 * @param {Document} doc
 * @returns {Map<string, Element>}
 */
function objectMapFromDoc(doc) {
	const map = new Map()
	const objects = doc.getElementsByTagNameNS(CORE_NS, 'object')
	for (let i = 0; i < objects.length; i++) {
		map.set(objects[i].getAttribute('id'), objects[i])
	}
	return map
}

/**
 * Emit the triangles of an object, resolving inline mesh AND components.
 * Components with a `path` cross into another model part (walkModel); components
 * without a path reference another object in the SAME document by objectid, so
 * we resolve them against `objectById` (this is the common Orca/Bambu shape:
 * a component-wrapper object in <build> that points at the real mesh object).
 * @param {Element} objectEl
 * @param {Map<string, Element>} objectById same-document object map
 * @param {typeof IDENTITY} transform
 * @param {number[]} outPositions
 * @param {number[]} outIndices
 * @param {JSZip} zip
 * @param {string} modelPath current model part path (for cross-part components)
 * @param {Set<string>} seen cycle guard on object ids
 */
async function emitObjectMesh(objectEl, objectById, transform, outPositions, outIndices, zip, modelPath, seen) {
	const oid = objectEl.getAttribute('id') || ''
	if (oid && seen.has(oid)) {
		return
	}
	if (oid) {
		seen.add(oid)
	}
	// Direct children only: a component-wrapper's descendant <mesh> belongs to a
	// referenced object, not this one, so restrict to this object's own mesh.
	const ownMesh = directChildMesh(objectEl)
	if (ownMesh) {
		meshFromObject(objectEl, transform, outPositions, outIndices)
	}
	const components = objectEl.getElementsByTagNameNS(CORE_NS, 'component')
	for (let c = 0; c < components.length; c++) {
		const comp = components[c]
		const childT = multiplyTransform(transform, parse3mfTransform(comp.getAttribute('transform')))
		const path = comp.getAttributeNS(PROD_NS, 'path')
			|| comp.getAttribute('p:path')
			|| comp.getAttribute('path')
		if (path) {
			await walkModel(zip, resolveZipPath(modelPath, path), childT, outPositions, outIndices)
			continue
		}
		// Same-document reference by objectid.
		const refId = comp.getAttribute('objectid')
		const refObj = refId ? objectById.get(refId) : null
		if (refObj) {
			await emitObjectMesh(refObj, objectById, childT, outPositions, outIndices, zip, modelPath, seen)
		}
	}
}

/**
 * The object's own direct-child <mesh> (not a descendant belonging to a
 * referenced component object).
 * @param {Element} objectEl
 * @returns {Element|null}
 */
function directChildMesh(objectEl) {
	for (let i = 0; i < objectEl.childNodes.length; i++) {
		const n = objectEl.childNodes[i]
		if (n.nodeType === 1 && (n.localName === 'mesh')) {
			return n
		}
	}
	return null
}

/**
 * @param {JSZip} zip
 * @param {string} modelPath
 * @param {typeof IDENTITY} transform
 * @param {number[]} outPositions
 * @param {number[]} outIndices
 */
async function walkModel(zip, modelPath, transform, outPositions, outIndices) {
	const entry = zip.file(modelPath)
	if (!entry) {
		throw new Error(`3MF missing part: ${modelPath}`)
	}
	const doc = parseModelXml(await entry.async('text'))
	const objectById = objectMapFromDoc(doc)
	// Prefer build items when present so we honour transforms/printable flags;
	// otherwise emit every object that carries geometry.
	const buildItems = doc.getElementsByTagNameNS(CORE_NS, 'item')
	if (buildItems.length > 0) {
		for (let i = 0; i < buildItems.length; i++) {
			const item = buildItems[i]
			if (item.getAttribute('printable') === '0') {
				continue
			}
			const obj = objectById.get(item.getAttribute('objectid'))
			if (!obj) {
				continue
			}
			const itemT = multiplyTransform(transform, parse3mfTransform(item.getAttribute('transform')))
			await emitObjectMesh(obj, objectById, itemT, outPositions, outIndices, zip, modelPath, new Set())
		}
		return
	}
	const objects = doc.getElementsByTagNameNS(CORE_NS, 'object')
	for (let i = 0; i < objects.length; i++) {
		await emitObjectMesh(objects[i], objectById, transform, outPositions, outIndices, zip, modelPath, new Set())
	}
}

/**
 * @param {ArrayBuffer} arrayBuffer
 * @returns {Promise<Array<{ id: string, objectId: string, name: string, printable: boolean }>>}
 */
export async function list3mfBuildItems(arrayBuffer) {
	const zip = await JSZip.loadAsync(arrayBuffer)
	const rootPath = zip.file('3D/3dmodel.model') ? '3D/3dmodel.model' : null
	if (!rootPath) {
		throw new Error('Not a valid 3MF (missing 3D/3dmodel.model)')
	}
	const rootDoc = parseModelXml(await zip.file(rootPath).async('text'))
	const buildItems = rootDoc.getElementsByTagNameNS(CORE_NS, 'item')
	const objectById = new Map()
	const resourceObjects = rootDoc.getElementsByTagNameNS(CORE_NS, 'object')
	for (let i = 0; i < resourceObjects.length; i++) {
		const obj = resourceObjects[i]
		objectById.set(obj.getAttribute('id'), obj)
	}
	const out = []
	for (let i = 0; i < buildItems.length; i++) {
		const item = buildItems[i]
		const id = item.getAttribute('id') || String(i + 1)
		const objectId = item.getAttribute('objectid') || ''
		const printable = item.getAttribute('printable') !== '0'
		const topObj = objectById.get(objectId)
		const name = topObj?.getAttribute('name')
			|| topObj?.getAttribute('partnumber')
			|| `Object ${objectId || id}`
		out.push({ id, objectId, name, printable })
	}
	if (out.length === 0) {
		out.push({ id: '1', objectId: '', name: 'Model', printable: true })
	}
	return out
}

/**
 * @param {ArrayBuffer} arrayBuffer
 * @param {{ selectedIds?: string[] }} [options]
 * @returns {Promise<{ positions: Float32Array, indices: Uint32Array, triangleCount: number, bbox: { x: number, y: number, z: number } }>}
 */
export async function parse3mfMesh(arrayBuffer, options = {}) {
	const zip = await JSZip.loadAsync(arrayBuffer)
	const rootPath = zip.file('3D/3dmodel.model') ? '3D/3dmodel.model' : null
	if (!rootPath) {
		throw new Error('Not a valid 3MF (missing 3D/3dmodel.model)')
	}

	const selectedSet = options.selectedIds?.length
		? new Set(options.selectedIds.map(String))
		: null

	const positions = []
	const indices = []
	const rootDoc = parseModelXml(await zip.file(rootPath).async('text'))
	const buildItems = rootDoc.getElementsByTagNameNS(CORE_NS, 'item')

	if (buildItems.length > 0) {
		const objectById = objectMapFromDoc(rootDoc)
		for (let i = 0; i < buildItems.length; i++) {
			const item = buildItems[i]
			const itemId = item.getAttribute('id') || String(i + 1)
			if (selectedSet && !selectedSet.has(String(itemId))) {
				continue
			}
			if (item.getAttribute('printable') === '0') {
				continue
			}
			const objectId = item.getAttribute('objectid')
			const itemT = parse3mfTransform(item.getAttribute('transform'))
			const topObj = objectById.get(objectId)
			if (!topObj) {
				continue
			}
			// Resolve inline mesh AND same-document/cross-part components.
			await emitObjectMesh(topObj, objectById, itemT, positions, indices, zip, rootPath, new Set())
		}
	} else {
		await walkModel(zip, rootPath, { ...IDENTITY }, positions, indices)
	}

	if (indices.length < 3) {
		throw new Error('3MF contains no triangle mesh (project-only file?)')
	}

	const posArr = new Float32Array(positions)
	let minX = Infinity
	let minY = Infinity
	let minZ = Infinity
	let maxX = -Infinity
	let maxY = -Infinity
	let maxZ = -Infinity
	for (let i = 0; i < posArr.length; i += 3) {
		minX = Math.min(minX, posArr[i])
		maxX = Math.max(maxX, posArr[i])
		minY = Math.min(minY, posArr[i + 1])
		maxY = Math.max(maxY, posArr[i + 1])
		minZ = Math.min(minZ, posArr[i + 2])
		maxZ = Math.max(maxZ, posArr[i + 2])
	}

	return {
		positions: posArr,
		indices: new Uint32Array(indices),
		triangleCount: indices.length / 3,
		bbox: {
			x: maxX - minX,
			y: maxY - minY,
			z: maxZ - minZ,
		},
	}
}

/** Compute an xyz bbox {x,y,z} from a flat position array. */
function bboxOf(posArr) {
	let minX = Infinity, minY = Infinity, minZ = Infinity
	let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
	for (let i = 0; i < posArr.length; i += 3) {
		minX = Math.min(minX, posArr[i]); maxX = Math.max(maxX, posArr[i])
		minY = Math.min(minY, posArr[i + 1]); maxY = Math.max(maxY, posArr[i + 1])
		minZ = Math.min(minZ, posArr[i + 2]); maxZ = Math.max(maxZ, posArr[i + 2])
	}
	return { x: maxX - minX, y: maxY - minY, z: maxZ - minZ }
}

/**
 * Parse a 3MF into ONE mesh per build item (Phase 3e), so a multi-object 3MF
 * loads as independent, movable objects instead of a single merged mesh. Returns
 * an array of { id, name, positions, indices, triangleCount, bbox }. Falls back
 * to a single merged mesh (id 'all') for 3MFs without build items. Honors
 * options.selectedIds + the printable flag, like parse3mfMesh.
 * @param {ArrayBuffer} arrayBuffer
 * @param {{ selectedIds?: string[] }} [options]
 * @returns {Promise<Array<{id:string,name:string,positions:Float32Array,indices:Uint32Array,triangleCount:number,bbox:object}>>}
 */
export async function parse3mfMeshes(arrayBuffer, options = {}) {
	const zip = await JSZip.loadAsync(arrayBuffer)
	const rootPath = zip.file('3D/3dmodel.model') ? '3D/3dmodel.model' : null
	if (!rootPath) {
		throw new Error('Not a valid 3MF (missing 3D/3dmodel.model)')
	}
	const selectedSet = options.selectedIds?.length
		? new Set(options.selectedIds.map(String))
		: null
	const rootDoc = parseModelXml(await zip.file(rootPath).async('text'))
	const buildItems = rootDoc.getElementsByTagNameNS(CORE_NS, 'item')

	// No build items → single merged mesh (reuse the existing merge parser).
	if (buildItems.length === 0) {
		const merged = await parse3mfMesh(arrayBuffer, options)
		return [{ id: 'all', name: 'Object', ...merged }]
	}

	const objectById = objectMapFromDoc(rootDoc)
	const out = []
	for (let i = 0; i < buildItems.length; i++) {
		const item = buildItems[i]
		const itemId = item.getAttribute('id') || String(i + 1)
		if (selectedSet && !selectedSet.has(String(itemId))) {
			continue
		}
		if (item.getAttribute('printable') === '0') {
			continue
		}
		const objectId = item.getAttribute('objectid')
		const itemT = parse3mfTransform(item.getAttribute('transform'))
		const topObj = objectById.get(objectId)
		if (!topObj) {
			continue
		}
		const positions = []
		const indices = []
		await emitObjectMesh(topObj, objectById, itemT, positions, indices, zip, rootPath, new Set())
		if (indices.length < 3) {
			continue
		}
		const posArr = new Float32Array(positions)
		const name = topObj.getAttribute?.('name') || `Object ${out.length + 1}`
		out.push({
			id: String(itemId),
			name,
			positions: posArr,
			indices: new Uint32Array(indices),
			triangleCount: indices.length / 3,
			bbox: bboxOf(posArr),
		})
	}
	if (!out.length) {
		throw new Error('3MF contains no printable triangle mesh')
	}
	return out
}

/**
 * @param {{ positions: Float32Array, indices: Uint32Array }} mesh
 * @returns {ArrayBuffer}
 */
export function meshToStlBuffer(mesh) {
	const triCount = mesh.indices.length / 3
	const headerSize = 80
	const triSize = 50
	const out = new ArrayBuffer(headerSize + 4 + triCount * triSize)
	const view = new DataView(out)
	const bytes = new Uint8Array(out)
	const header = 'Generated by NC 3D Print'
	bytes.set(new TextEncoder().encode(header).slice(0, headerSize), 0)
	view.setUint32(headerSize, triCount, true)
	let p = headerSize + 4
	for (let f = 0; f < triCount; f++) {
		const a = mesh.indices[3 * f]
		const b = mesh.indices[3 * f + 1]
		const c = mesh.indices[3 * f + 2]
		const ax = mesh.positions[3 * a]
		const ay = mesh.positions[3 * a + 1]
		const az = mesh.positions[3 * a + 2]
		const bx = mesh.positions[3 * b]
		const by = mesh.positions[3 * b + 1]
		const bz = mesh.positions[3 * b + 2]
		const cx = mesh.positions[3 * c]
		const cy = mesh.positions[3 * c + 1]
		const cz = mesh.positions[3 * c + 2]
		const e1x = bx - ax
		const e1y = by - ay
		const e1z = bz - az
		const e2x = cx - ax
		const e2y = cy - ay
		const e2z = cz - az
		let nx = e1y * e2z - e1z * e2y
		let ny = e1z * e2x - e1x * e2z
		let nz = e1x * e2y - e1y * e2x
		const len = Math.hypot(nx, ny, nz)
		if (len > 0) {
			nx /= len
			ny /= len
			nz /= len
		}
		view.setFloat32(p, nx, true)
		view.setFloat32(p + 4, ny, true)
		view.setFloat32(p + 8, nz, true)
		view.setFloat32(p + 12, ax, true)
		view.setFloat32(p + 16, ay, true)
		view.setFloat32(p + 20, az, true)
		view.setFloat32(p + 24, bx, true)
		view.setFloat32(p + 28, by, true)
		view.setFloat32(p + 32, bz, true)
		view.setFloat32(p + 36, cx, true)
		view.setFloat32(p + 40, cy, true)
		view.setFloat32(p + 44, cz, true)
		view.setUint16(p + 48, 0, true)
		p += 50
	}
	return out
}

/**
 * @param {ArrayBuffer} arrayBuffer
 * @returns {Promise<ArrayBuffer>}
 */
export async function convert3mfToStlBuffer(arrayBuffer, options = {}) {
	const mesh = await parse3mfMesh(arrayBuffer, options)
	return meshToStlBuffer(mesh)
}
