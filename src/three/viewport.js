/**
 * Lazy-loaded Three.js viewport helpers (webpack chunk nc-print-three).
 */

let _threePromise = null

function loadThree() {
	if (!_threePromise) {
		_threePromise = import(/* webpackChunkName: "nc-print-three" */ 'three')
	}
	return _threePromise
}

/**
 * @typedef {object} ViewportHandle
 * @property {() => void} dispose
 * @property {(file: File) => Promise<object>} loadModel
 * @property {() => void} recenter
 * @property {(volume: number[]) => void} setBedVolume
 * @property {() => object|null} getModelMeta
 */

/**
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLElement} wrap
 * @returns {Promise<ViewportHandle>}
 */
export async function createViewport(canvas, wrap) {
	const THREE = await loadThree()
	const { OrbitControls } = await import(/* webpackChunkName: "nc-print-three" */ 'three/examples/jsm/controls/OrbitControls.js')

	const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
	renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))

	const scene = new THREE.Scene()
	scene.background = new THREE.Color(0x161b22)

	const camera = new THREE.PerspectiveCamera(40, 1, 1, 5000)
	camera.position.set(280, 280, 220)

	scene.add(new THREE.AmbientLight(0xffffff, 0.5))
	const dir = new THREE.DirectionalLight(0xffffff, 0.85)
	dir.position.set(150, 200, 100)
	scene.add(dir)

	const controls = new OrbitControls(camera, canvas)
	controls.target.set(110, 110, 30)
	controls.update()

	let bedHelper = null
	let modelMesh = null
	let bedVolume = [220, 220, 220]
	let modelMeta = null
	let animId = null

	function resize() {
		const w = Math.max(wrap.clientWidth, 1)
		const h = Math.max(wrap.clientHeight, 320)
		camera.aspect = w / h
		camera.updateProjectionMatrix()
		renderer.setSize(w, h, false)
	}

	function drawBed(volume) {
		bedVolume = volume
		if (bedHelper) {
			scene.remove(bedHelper)
			bedHelper = null
		}
		const [bx, by, bz] = volume
		const group = new THREE.Group()
		const boxGeo = new THREE.BoxGeometry(bx, by, bz)
		const edges = new THREE.EdgesGeometry(boxGeo)
		const lines = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xfacc15 }))
		lines.position.set(bx / 2, by / 2, bz / 2)
		group.add(lines)
		const plate = new THREE.Mesh(
			new THREE.PlaneGeometry(bx, by),
			new THREE.MeshBasicMaterial({ color: 0x3b3b3b, transparent: true, opacity: 0.4, side: THREE.DoubleSide }),
		)
		plate.position.set(bx / 2, by / 2, 0)
		group.add(plate)
		const grid = new THREE.GridHelper(Math.max(bx, by), Math.floor(Math.max(bx, by) / 10), 0x4b5563, 0x2a2f3a)
		grid.rotation.x = Math.PI / 2
		grid.position.set(bx / 2, by / 2, 0.01)
		group.add(grid)
		scene.add(group)
		bedHelper = group
		controls.target.set(bx / 2, by / 2, bz / 4)
		camera.position.set(bx + 100, by + 100, bz)
		camera.lookAt(controls.target)
		controls.update()
	}

	drawBed(bedVolume)

	function animate() {
		animId = requestAnimationFrame(animate)
		controls.update()
		renderer.render(scene, camera)
	}
	resize()
	animate()

	const ro = new ResizeObserver(() => resize())
	ro.observe(wrap)

	function centerMesh(mesh) {
		const geom = mesh.geometry
		geom.computeBoundingBox()
		const bbox = geom.boundingBox
		const cx = (bbox.min.x + bbox.max.x) / 2
		const cy = (bbox.min.y + bbox.max.y) / 2
		const cz = bbox.min.z
		const [bx, by] = bedVolume
		mesh.position.set(bx / 2 - cx, by / 2 - cy, -cz)
		mesh.rotation.set(0, 0, 0)
		const size = new THREE.Vector3()
		bbox.getSize(size)
		modelMeta = {
			bbox: { x: size.x, y: size.y, z: size.z },
			triangleCount: geom.attributes?.position?.count
				? Math.floor(geom.attributes.position.count / 3)
				: 0,
		}
	}

	async function loadModel(file) {
		if (modelMesh) {
			scene.remove(modelMesh)
			modelMesh.geometry.dispose()
			modelMesh.material.dispose()
			modelMesh = null
			modelMeta = null
		}

		const buf = await file.arrayBuffer()
		const lower = (file.name || '').toLowerCase()

		if (lower.endsWith('.stl')) {
			const { STLLoader } = await import(/* webpackChunkName: "nc-print-three" */ 'three/examples/jsm/loaders/STLLoader.js')
			const loader = new STLLoader()
			const geom = loader.parse(buf)
			geom.computeVertexNormals()
			const mat = new THREE.MeshLambertMaterial({ color: 0x22c55e, transparent: true, opacity: 0.85 })
			modelMesh = new THREE.Mesh(geom, mat)
			centerMesh(modelMesh)
			scene.add(modelMesh)
			return modelMeta
		}

		modelMeta = { bbox: null, triangleCount: 0, previewSkipped: true, format: lower.split('.').pop() }
		return modelMeta
	}

	return {
		dispose() {
			if (animId) {
				cancelAnimationFrame(animId)
			}
			ro.disconnect()
			if (modelMesh) {
				modelMesh.geometry.dispose()
				modelMesh.material.dispose()
			}
			renderer.dispose()
		},
		loadModel,
		recenter() {
			if (modelMesh) {
				centerMesh(modelMesh)
			}
		},
		setBedVolume(volume) {
			if (Array.isArray(volume) && volume.length === 3) {
				drawBed(volume)
				if (modelMesh) {
					centerMesh(modelMesh)
				}
			}
		},
		getModelMeta() {
			return modelMeta
		},
	}
}
