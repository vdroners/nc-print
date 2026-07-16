/**
 * @vitest-environment node
 * Source-regex guards for the v1.68 .3mf project round-trip: adapter pack
 * endpoint + project_meta, PHP writeSibling/saveProject, and the FE save/read
 * + store hydrate wiring.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const adapter = read('../../slicer/adapter/main.py')
const mesh3mf = read('../../slicer/adapter/mesh3mf.py')
const fileFetch = read('../../lib/Service/FileFetchService.php')
const controller = read('../../lib/Controller/GcodeSaveController.php')
const routes = read('../../appinfo/routes.php')
const projectApi = read('../services/project-api.js')
const meshConvert = read('../services/mesh-convert.js')
const store = read('../store/print.js')
const modelViewport = read('../components/ModelViewport.vue')

describe('.3mf project round-trip (v1.68) — source', () => {
	it('adapter packs a project 3mf with embedded metadata', () => {
		expect(adapter).toMatch(/\/api\/project\/pack/)
		expect(adapter).toMatch(/project_meta/)
		expect(mesh3mf).toMatch(/project_meta: dict \| None = None/)
		expect(mesh3mf).toMatch(/Metadata\/nc_print_project\.json/)
	})

	it('PHP generalises the sibling write + adds saveProject', () => {
		expect(fileFetch).toMatch(/private function writeSibling/)
		expect(fileFetch).toMatch(/public function writeProjectSibling/)
		expect(fileFetch).toMatch(/\.nc\.3mf/)
		expect(controller).toMatch(/public function saveProject/)
		expect(controller).toMatch(/project_base64/)
		expect(routes).toMatch(/files#saveProject/)
	})

	it('FE packs (client-side JSZip) + saves + reads project metadata', () => {
		expect(projectApi).toMatch(/export async function packProject/)
		expect(projectApi).toMatch(/export async function saveProjectToFiles/)
		// authored client-side with JSZip (avoids the proxy multipart limitation)
		expect(projectApi).toMatch(/new JSZip\(\)/)
		expect(projectApi).toMatch(/nc_print_project\.json/)
		expect(projectApi).toMatch(/3dmodel\.model/)
		expect(meshConvert).toMatch(/export async function readProjectMeta/)
		// graceful degrade: absent entry → null
		expect(meshConvert).toMatch(/if \(!entry\) \{\s*return null/)
	})

	it('store builds + hydrates project meta, ModelViewport hydrates on import', () => {
		expect(store).toMatch(/buildProjectMeta\(\)/)
		expect(store).toMatch(/hydrateFromProjectMeta\(meta\)/)
		expect(store).toMatch(/'nc-print-project\/1'/)
		expect(store).toMatch(/async saveProject\(geometries\)/)
		expect(modelViewport).toMatch(/_maybeHydrateProject/)
		expect(modelViewport).toMatch(/readProjectMeta/)
	})
})
