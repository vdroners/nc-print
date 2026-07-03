/**
 * Server-side mesh health analysis client.
 *
 * Complements the browser-side analyzeMesh() in src/services/mesh-analyze.js:
 * the sidecar parses the STL authoritatively (same parser the slicer feeds) and
 * reports open/non-manifold edges + watertight + bbox. Useful for large meshes
 * where client-side analysis is slow, or to confirm the exact geometry the
 * engine will slice.
 */
import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'

const apiBase = () => generateUrl('/apps/nc_print/api/slicer')

/**
 * @param {ArrayBuffer|Blob} stl
 * @returns {Promise<{ ok: boolean, watertight?: boolean, open_edges?: number, non_manifold_edges?: number, triangles?: number, bbox?: object, warnings?: string[], error?: string }>}
 */
export async function analyzeMeshServer(stl) {
	const body = stl instanceof Blob ? await stl.arrayBuffer() : stl
	const { data } = await axios.post(`${apiBase()}/mesh/analyze`, body, {
		headers: { 'Content-Type': 'application/octet-stream' },
	})
	return data
}
