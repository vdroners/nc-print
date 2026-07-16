import { generateUrl } from '@nextcloud/router'
import axios from '@nextcloud/axios'
import JSZip from 'jszip'

// Pack a project .3mf (geometry + embedded nc_print_project.json metadata) and
// save it next to the model in Nextcloud Files. Authoring is client-side with
// JSZip — symmetric with mesh-convert's 3MF reader, and it avoids round-tripping
// large meshes through the proxy. The embedded metadata is what makes the file
// re-openable as an editable project. The adapter also has a /api/project/pack
// endpoint for headless use, but the UI packs locally.

const saveUrl = () => generateUrl('/apps/nc_print/api/files/save-project')

const CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8"?>'
	+ '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
	+ '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
	+ '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>'
	+ '</Types>'
const RELS = '<?xml version="1.0" encoding="UTF-8"?>'
	+ '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
	+ '<Relationship Target="/3D/3dmodel.model" Id="rel0" '
	+ 'Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'

/** Build the 3D/3dmodel.model XML from per-object {positions, indices}. */
function buildModelXml(geometries) {
	const objects = []
	const items = []
	geometries.forEach((g, idx) => {
		const id = idx + 1
		const pos = g.positions
		const verts = []
		for (let i = 0; i < pos.length; i += 3) {
			verts.push(`<vertex x="${pos[i]}" y="${pos[i + 1]}" z="${pos[i + 2]}"/>`)
		}
		const idc = g.indices
		const tris = []
		for (let i = 0; i < idc.length; i += 3) {
			tris.push(`<triangle v1="${idc[i]}" v2="${idc[i + 1]}" v3="${idc[i + 2]}"/>`)
		}
		objects.push(`<object id="${id}" type="model"><mesh><vertices>${verts.join('')}</vertices>`
			+ `<triangles>${tris.join('')}</triangles></mesh></object>`)
		items.push(`<item objectid="${id}" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>`)
	})
	return '<?xml version="1.0" encoding="UTF-8"?>'
		+ '<model unit="millimeter" xml:lang="en-US" '
		+ 'xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">'
		+ `<resources>${objects.join('')}</resources><build>${items.join('')}</build></model>`
}

/**
 * Author a project .3mf from per-object geometry + project metadata (client-side).
 * @param {{ geometries: Array<{positions:Float32Array|number[], indices:Uint32Array|number[]}>, projectMeta: object }} args
 * @returns {Promise<Blob>}
 */
export async function packProject({ geometries, projectMeta }) {
	if (!Array.isArray(geometries) || !geometries.length) {
		throw new Error('No geometry to pack')
	}
	const zip = new JSZip()
	zip.file('[Content_Types].xml', CONTENT_TYPES)
	zip.folder('_rels').file('.rels', RELS)
	zip.folder('3D').file('3dmodel.model', buildModelXml(geometries))
	zip.folder('Metadata').file('nc_print_project.json', JSON.stringify(projectMeta || {}))
	return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
}

/**
 * Save a packed project .3mf next to the model file (Nextcloud writes
 * "<model-stem>.nc.3mf"). Sends base64 to the PHP save-project endpoint.
 * @param {{ file_id?: number, dav_path?: string, projectBlob: Blob }} args
 * @returns {Promise<object>} the saved file descriptor
 */
export async function saveProjectToFiles({ file_id, dav_path, projectBlob }) {
	const b64 = await blobToBase64(projectBlob)
	const { data } = await axios.post(saveUrl(), {
		file_id: file_id || 0,
		dav_path: dav_path || '',
		project_base64: b64,
	})
	return data
}

function blobToBase64(blob) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onloadend = () => {
			// strip the "data:...;base64," prefix
			const s = String(reader.result || '')
			resolve(s.slice(s.indexOf(',') + 1))
		}
		reader.onerror = reject
		reader.readAsDataURL(blob)
	})
}
