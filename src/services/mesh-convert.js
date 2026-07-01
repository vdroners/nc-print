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
	const objects = doc.getElementsByTagNameNS(CORE_NS, 'object')
	for (let i = 0; i < objects.length; i++) {
		const obj = objects[i]
		const meshEl = obj.getElementsByTagNameNS(CORE_NS, 'mesh')[0]
		const components = obj.getElementsByTagNameNS(CORE_NS, 'component')
		if (meshEl) {
			meshFromObject(obj, transform, outPositions, outIndices)
		}
		for (let c = 0; c < components.length; c++) {
			const comp = components[c]
			const path = comp.getAttributeNS(PROD_NS, 'path')
				|| comp.getAttribute('p:path')
				|| comp.getAttribute('path')
			if (!path) {
				continue
			}
			const childT = multiplyTransform(transform, parse3mfTransform(comp.getAttribute('transform')))
			await walkModel(zip, resolveZipPath(modelPath, path), childT, outPositions, outIndices)
		}
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
		const objectById = new Map()
		const resourceObjects = rootDoc.getElementsByTagNameNS(CORE_NS, 'object')
		for (let i = 0; i < resourceObjects.length; i++) {
			const obj = resourceObjects[i]
			objectById.set(obj.getAttribute('id'), obj)
		}
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
			const components = topObj.getElementsByTagNameNS(CORE_NS, 'component')
			if (components.length) {
				for (let c = 0; c < components.length; c++) {
					const comp = components[c]
					const path = comp.getAttributeNS(PROD_NS, 'path')
						|| comp.getAttribute('p:path')
						|| comp.getAttribute('path')
					if (!path) {
						continue
					}
					const childT = multiplyTransform(itemT, parse3mfTransform(comp.getAttribute('transform')))
					await walkModel(zip, resolveZipPath(rootPath, path), childT, positions, indices)
				}
			} else if (topObj.getElementsByTagNameNS(CORE_NS, 'mesh')[0]) {
				meshFromObject(topObj, itemT, positions, indices)
			}
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
