/**
 * Lazy-loaded Three.js viewport helpers (webpack chunk nc-print-three).
 * Uses Z-up coordinates to match slicer / Orca convention (bed in XY at z=0).
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
 * @property {(axis: 'x'|'y'|'z', degrees: number) => void} rotateModel
 * @property {(volume: number[]) => void} setBedVolume
 * @property {(visible: boolean) => void} showBedVolume
 * @property {(name: 'top'|'front'|'iso'|'bed') => void} setCameraPreset
 * @property {() => object|null} getModelMeta
 * @property {() => object|null} getTransform
 * @property {(transform: object) => void} setTransform
 * @property {() => Promise<object|null>} exportTransformedMesh
 */

/**
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLElement} wrap
 * @returns {Promise<ViewportHandle>}
 */
export async function createViewport(canvas, wrap) {
	const THREE = await loadThree()
	const { OrbitControls } = await import(/* webpackChunkName: "nc-print-three" */ 'three/examples/jsm/controls/OrbitControls.js')
	const { TransformControls } = await import(/* webpackChunkName: "nc-print-three" */ 'three/examples/jsm/controls/TransformControls.js')

	const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
	renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))

	const scene = new THREE.Scene()
	scene.background = new THREE.Color(0x161b22)

	const camera = new THREE.PerspectiveCamera(40, 1, 1, 5000)
	camera.up.set(0, 0, 1)
	camera.position.set(280, 280, 220)

	scene.add(new THREE.AmbientLight(0xffffff, 0.5))
	const dir = new THREE.DirectionalLight(0xffffff, 0.85)
	dir.position.set(150, 200, 120)
	scene.add(dir)

	const controls = new OrbitControls(camera, canvas)
	controls.target.set(110, 110, 30)
	controls.update()

	let bedHelper = null
	let bedVisible = true
	// Multi-object scene (Phase 3b). `objects` holds every mesh; `modelMesh` is a
	// live ALIAS to the currently-selected mesh, so all existing single-object
	// code paths (gizmo, clip, section, transform, export-selected) operate on the
	// selection unchanged. `selectObjectById` is the ONE place that repoints the
	// alias + gizmo — routing every attach/detach through it (per the design) is
	// what keeps the gizmo lifecycle safe.
	const objects = [] // [{ id, mesh }]
	let selectedId = null
	let objSeq = 0
	let modelMesh = null
	let bedVolume = [220, 220, 220]
	let modelMeta = null
	let animId = null
	let onSelectionChange = null

	// Interactive gizmo (TransformControls) state.
	let gizmo = null
	let gizmoHelper = null
	let gizmoMode = null
	let onGizmoChange = null
	// Non-destructive view state re-applied whenever modelMesh is rebuilt.
	let wireframe = false
	const clipState = { enabled: false, axis: 'z', offset: 0, flip: false }
	let clipPlane = null
	let cutPlaneHelper = null
	const raycaster = new THREE.Raycaster()

	// 3D toolpath preview state (built from a slice job's parsed gcode).
	let toolpathGroup = null
	// feature key -> { line: THREE.LineSegments, layerIndex: Uint32Array (per vertex) }
	const toolpathLines = new Map()
	let toolpathLayerCount = 0

	function ensureGizmo() {
		if (gizmo) {
			return gizmo
		}
		gizmo = new TransformControls(camera, canvas)
		gizmo.setSize(0.85)
		gizmo.setTranslationSnap(1)
		gizmo.setRotationSnap(THREE.MathUtils.degToRad(15))
		gizmo.setScaleSnap(0.05)
		gizmo.addEventListener('dragging-changed', (event) => {
			controls.enabled = !event.value
			if (!event.value && typeof onGizmoChange === 'function') {
				// Drag finished: push a final sync.
				onGizmoChange()
			}
		})
		gizmo.addEventListener('objectChange', () => {
			if (modelMesh) {
				modelMesh.updateMatrixWorld(true)
			}
			applyClipPlane()
			if (typeof onGizmoChange === 'function') {
				onGizmoChange()
			}
		})
		gizmoHelper = gizmo.getHelper ? gizmo.getHelper() : gizmo
		scene.add(gizmoHelper)
		return gizmo
	}

	function detachGizmo() {
		if (gizmo) {
			gizmo.detach()
		}
	}

	function disposeGizmo() {
		if (gizmo) {
			gizmo.detach()
			gizmo.dispose()
		}
		if (gizmoHelper) {
			scene.remove(gizmoHelper)
		}
		gizmo = null
		gizmoHelper = null
		gizmoMode = null
	}

	function selectedEntry() {
		return objects.find((o) => o.id === selectedId) || null
	}

	// Subtle emissive tint marks the selected object; others revert to flat.
	function applyHighlight() {
		for (const { id, mesh } of objects) {
			const mat = mesh.material
			if (!mat?.emissive) {
				continue
			}
			if (id === selectedId) {
				mat.emissive.setHex(0x1e6b3a)
			} else {
				mat.emissive.setHex(0x000000)
			}
		}
	}

	/**
	 * THE single place that repoints the `modelMesh` alias + gizmo. Pass null to
	 * deselect (detaches the gizmo). Always detach before the alias moves so the
	 * gizmo never points at a stale/disposed mesh.
	 */
	function selectObjectById(id, notify = true) {
		const entry = objects.find((o) => o.id === id) || null
		selectedId = entry ? entry.id : null
		detachGizmo()
		modelMesh = entry ? entry.mesh : null
		modelMeta = entry ? entry.meta || modelMeta : null
		if (modelMesh && gizmoMode) {
			ensureGizmo()
			gizmo.attach(modelMesh)
			gizmo.setMode(gizmoMode)
		}
		applyHighlight()
		if (notify && typeof onSelectionChange === 'function') {
			onSelectionChange(selectedId)
		}
	}

	/** Raycast the objects and return the hit object id (nearest), or null. */
	function pickObjectAt(clientX, clientY) {
		if (!objects.length) {
			return null
		}
		const rect = canvas.getBoundingClientRect()
		const ndc = new THREE.Vector2(
			((clientX - rect.left) / rect.width) * 2 - 1,
			-((clientY - rect.top) / rect.height) * 2 + 1,
		)
		raycaster.setFromCamera(ndc, camera)
		const hits = raycaster.intersectObjects(objects.map((o) => o.mesh), false)
		if (!hits.length) {
			return null
		}
		const hitMesh = hits[0].object
		return objects.find((o) => o.mesh === hitMesh)?.id ?? null
	}

	function removeObjectById(id) {
		const idx = objects.findIndex((o) => o.id === id)
		if (idx < 0) {
			return
		}
		const [entry] = objects.splice(idx, 1)
		if (selectedId === id) {
			// Detach gizmo BEFORE disposing the mesh it may be attached to.
			detachGizmo()
			selectedId = null
			modelMesh = null
		}
		scene.remove(entry.mesh)
		entry.mesh.geometry.dispose()
		entry.mesh.material.dispose()
		// Reselect a neighbour (or null).
		const next = objects[Math.max(0, idx - 1)]
		selectObjectById(next ? next.id : null)
	}

	function planeNormalForAxis(axis, flip) {
		const s = flip ? 1 : -1
		if (axis === 'x') {
			return new THREE.Vector3(s, 0, 0)
		}
		if (axis === 'y') {
			return new THREE.Vector3(0, s, 0)
		}
		return new THREE.Vector3(0, 0, s)
	}

	function applyClipPlane() {
		if (!modelMesh) {
			return
		}
		const mat = modelMesh.material
		if (!clipState.enabled) {
			mat.clippingPlanes = []
			mat.needsUpdate = true
			return
		}
		renderer.localClippingEnabled = true
		if (!clipPlane) {
			clipPlane = new THREE.Plane()
		}
		const normal = planeNormalForAxis(clipState.axis, clipState.flip)
		// Plane constant so that normal·p + constant = 0 passes through offset.
		clipPlane.set(normal, -normal.dot(new THREE.Vector3(
			clipState.axis === 'x' ? clipState.offset : 0,
			clipState.axis === 'y' ? clipState.offset : 0,
			clipState.axis === 'z' ? clipState.offset : 0,
		)))
		mat.clippingPlanes = [clipPlane]
		mat.clipShadows = false
		mat.needsUpdate = true
	}

	function applyMaterialState(mat) {
		mat.wireframe = wireframe
		if (clipState.enabled) {
			applyClipPlane()
		}
	}

	function resize() {
		const w = Math.max(wrap.clientWidth, 1)
		const h = Math.max(wrap.clientHeight, 320)
		camera.aspect = w / h
		camera.updateProjectionMatrix()
		renderer.setSize(w, h, true)
	}

	function frameCamera() {
		camera.up.set(0, 0, 1)
		if (modelMesh) {
			const box = new THREE.Box3().setFromObject(modelMesh)
			const center = box.getCenter(new THREE.Vector3())
			const size = box.getSize(new THREE.Vector3())
			const maxDim = Math.max(size.x, size.y, size.z, 40)
			const dist = maxDim * 2.4
			camera.position.set(
				center.x + dist * 0.65,
				center.y + dist * 0.65,
				center.z + dist * 0.45,
			)
			controls.target.copy(center)
		} else {
			const [bx, by, bz] = bedVolume
			controls.target.set(bx / 2, by / 2, bz / 4)
			camera.position.set(bx + 100, by + 100, bz + 60)
		}
		camera.lookAt(controls.target)
		controls.update()
	}

	function updateBedVisibility() {
		if (bedHelper) {
			bedHelper.visible = bedVisible
		}
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
		updateBedVisibility()
		frameCamera()
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
		const size = new THREE.Vector3()
		bbox.getSize(size)
		modelMeta = {
			bbox: { x: size.x, y: size.y, z: size.z },
			triangleCount: geom.attributes?.position?.count
				? Math.floor(geom.attributes.position.count / 3)
				: 0,
		}
		frameCamera()
	}

	function addMeshFromGeometry(geom, opts = {}) {
		geom.computeVertexNormals()
		const mat = new THREE.MeshLambertMaterial({
			color: 0x22c55e,
			transparent: true,
			opacity: 0.85,
			clippingPlanes: [],
		})
		const mesh = new THREE.Mesh(geom, mat)
		const isFirst = objects.length === 0
		// First object → bed-centred; later objects → staggered so a new part
		// doesn't spawn inside an existing one.
		centerMesh(mesh)
		if (!isFirst) {
			mesh.updateMatrixWorld(true)
			const box = new THREE.Box3().setFromObject(mesh)
			const size = box.getSize(new THREE.Vector3())
			mesh.position.x += size.x * 1.15 * objects.length
		}
		scene.add(mesh)
		applyMaterialState(mat)
		objSeq += 1
		const id = opts.id || `vp_${objSeq}`
		const entry = { id, mesh, meta: modelMeta }
		objects.push(entry)
		// Select the newly-added object (repoints alias + gizmo).
		selectObjectById(id, opts.notify !== false)
		return { id, meta: modelMeta }
	}

	// Remove ALL objects (used on model load / clear).
	function clearModelMesh() {
		detachGizmo()
		selectedId = null
		modelMesh = null
		modelMeta = null
		for (const { mesh } of objects) {
			scene.remove(mesh)
			mesh.geometry.dispose()
			mesh.material.dispose()
		}
		objects.length = 0
	}

	async function loadModel(file, options = {}) {
		clearModelMesh()

		const buf = await file.arrayBuffer()
		const lower = (file.name || '').toLowerCase()

		if (lower.endsWith('.stl')) {
			const { STLLoader } = await import(/* webpackChunkName: "nc-print-three" */ 'three/examples/jsm/loaders/STLLoader.js')
			const loader = new STLLoader()
			const geom = loader.parse(buf)
			return addMeshFromGeometry(geom).meta
		}

		if (lower.endsWith('.obj')) {
			const { OBJLoader } = await import(/* webpackChunkName: "nc-print-three" */ 'three/examples/jsm/loaders/OBJLoader.js')
			const { mergeGeometries } = await import(/* webpackChunkName: "nc-print-three" */ 'three/examples/jsm/utils/BufferGeometryUtils.js')
			const text = new TextDecoder('utf-8', { fatal: false }).decode(buf)
			const group = new OBJLoader().parse(text)
			const geoms = []
			group.traverse(child => {
				if (child.isMesh && child.geometry) {
					geoms.push(child.geometry)
				}
			})
			if (!geoms.length) {
				throw new Error('OBJ contains no mesh geometry')
			}
			const geom = geoms.length === 1 ? geoms[0] : mergeGeometries(geoms, false)
			if (!geom) {
				throw new Error('Could not merge OBJ meshes')
			}
			return addMeshFromGeometry(geom).meta
		}

		if (lower.endsWith('.3mf')) {
			// Phase 3e: load each build item as an independent, movable object.
			const { parse3mfMeshes } = await import(/* webpackChunkName: "nc-print-mesh" */ '@/services/mesh-convert.js')
			const meshes = await parse3mfMeshes(buf, options)
			let totalTris = 0
			for (const m of meshes) {
				const geom = new THREE.BufferGeometry()
				geom.setAttribute('position', new THREE.BufferAttribute(m.positions, 3))
				geom.setIndex(new THREE.BufferAttribute(m.indices, 1))
				addMeshFromGeometry(geom)
				totalTris += m.triangleCount || 0
			}
			modelMeta = {
				bbox: meshes[0]?.bbox || null,
				triangleCount: totalTris,
				convertedFrom3mf: true,
				objectCount: meshes.length,
			}
			return modelMeta
		}

		modelMeta = { bbox: null, triangleCount: 0, previewSkipped: true, format: lower.split('.').pop() }
		return modelMeta
	}

	function setMeshData(mesh) {
		clearModelMesh()
		if (!mesh?.positions?.length || !mesh?.indices?.length) {
			return null
		}
		const geom = new THREE.BufferGeometry()
		geom.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3))
		geom.setIndex(new THREE.BufferAttribute(mesh.indices, 1))
		return addMeshFromGeometry(geom).meta
	}

	function scaleModelUniform(factor) {
		if (!modelMesh || !Number.isFinite(factor) || factor <= 0 || factor === 1) {
			return
		}
		modelMesh.scale.multiplyScalar(factor)
		centerMesh(modelMesh)
	}

	return {
		dispose() {
			if (animId) {
				cancelAnimationFrame(animId)
			}
			ro.disconnect()
			if (cutPlaneHelper) {
				scene.remove(cutPlaneHelper)
				cutPlaneHelper.geometry.dispose()
				cutPlaneHelper.material.dispose()
				cutPlaneHelper = null
			}
			disposeGizmo()
			if (toolpathGroup) {
				for (const { line } of toolpathLines.values()) {
					line.geometry.dispose()
					line.material.dispose()
				}
				scene.remove(toolpathGroup)
				toolpathGroup = null
				toolpathLines.clear()
			}
			clearModelMesh()
			renderer.dispose()
		},
		loadModel,
		setMeshData,
		scaleModelUniform,
		// ── Multi-object selection API (Phase 3b) ──
		pickObjectAt,
		selectObject(id) {
			selectObjectById(id)
		},
		deselect() {
			selectObjectById(null)
		},
		getSelectedId() {
			return selectedId
		},
		setSelectionChangeHandler(fn) {
			onSelectionChange = fn
		},
		listObjects() {
			return objects.map(({ id, mesh }) => {
				mesh.updateMatrixWorld(true)
				const box = new THREE.Box3().setFromObject(mesh)
				const size = box.getSize(new THREE.Vector3())
				return { id, bbox: { x: size.x, y: size.y, z: size.z } }
			})
		},
		removeObject(id) {
			removeObjectById(id)
		},
		/**
		 * Add a new object from raw {positions, indices} (Phase 3c cut halves).
		 * Returns the new object id, or null on empty input.
		 */
		addObjectFromMesh(mesh) {
			if (!mesh?.positions?.length || !mesh?.indices?.length) {
				return null
			}
			const geom = new THREE.BufferGeometry()
			geom.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3))
			geom.setIndex(new THREE.BufferAttribute(mesh.indices, 1))
			return addMeshFromGeometry(geom).id
		},
		/** Clone the selected mesh's geometry into a new, staggered, selected object. */
		duplicateSelected() {
			const entry = selectedEntry()
			if (!entry) {
				return null
			}
			const geom = entry.mesh.geometry.clone()
			const added = addMeshFromGeometry(geom)
			// Copy the source transform, then the stagger already applied in add.
			const dst = objects.find((o) => o.id === added.id)
			if (dst) {
				dst.mesh.rotation.copy(entry.mesh.rotation)
				dst.mesh.scale.copy(entry.mesh.scale)
				dst.mesh.position.copy(entry.mesh.position)
				dst.mesh.position.x += 10
				dst.mesh.position.y += 10
				dst.mesh.updateMatrixWorld(true)
			}
			return added.id
		},
		/**
		 * Export EVERY object with its world transform baked into vertices, in
		 * stable order — for the multi-object slice path (3d). Each entry:
		 * { id, positions, indices, bbox }.
		 */
		exportAllObjects() {
			return objects.map(({ id, mesh }) => {
				mesh.updateMatrixWorld(true)
				const g = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld)
				const pos = g.attributes.position
				const positions = new Float32Array(pos.array)
				let indices
				if (g.index) {
					indices = new Uint32Array(g.index.array)
				} else {
					indices = new Uint32Array(pos.count)
					for (let i = 0; i < pos.count; i++) {
						indices[i] = i
					}
				}
				g.computeBoundingBox()
				const b = g.boundingBox
				g.dispose()
				return {
					id,
					positions,
					indices,
					bbox: { x: b.max.x - b.min.x, y: b.max.y - b.min.y, z: b.max.z - b.min.z },
				}
			})
		},
		recenter() {
			if (modelMesh) {
				centerMesh(modelMesh)
			}
		},
		rotateModel(axis, degrees) {
			if (!modelMesh || !['x', 'y', 'z'].includes(axis)) {
				return
			}
			modelMesh.rotation[axis] += THREE.MathUtils.degToRad(degrees)
			centerMesh(modelMesh)
		},
		setBedVolume(volume) {
			if (Array.isArray(volume) && volume.length === 3) {
				drawBed(volume)
				if (modelMesh) {
					centerMesh(modelMesh)
				}
			}
		},
		showBedVolume(visible) {
			bedVisible = visible !== false
			updateBedVisibility()
		},
		setCameraPreset(name) {
			const [bx, by, bz] = bedVolume
			const target = modelMesh
				? new THREE.Box3().setFromObject(modelMesh).getCenter(new THREE.Vector3())
				: new THREE.Vector3(bx / 2, by / 2, bz / 4)
			controls.target.copy(target)
			const dist = modelMesh
				? Math.max(...new THREE.Box3().setFromObject(modelMesh).getSize(new THREE.Vector3()).toArray(), 40) * 2.4
				: Math.max(bx, by, bz) * 1.6
			if (name === 'fit') {
				frameCamera()
				return
			}
			const presets = {
				top: () => camera.position.set(target.x, target.y, target.z + dist),
				front: () => camera.position.set(target.x, target.y - dist, target.z + dist * 0.15),
				right: () => camera.position.set(target.x + dist, target.y, target.z + dist * 0.15),
				iso: () => camera.position.set(target.x + dist * 0.65, target.y + dist * 0.65, target.z + dist * 0.45),
				bed: () => camera.position.set(bx / 2 + dist * 0.55, by / 2 + dist * 0.55, dist * 0.35),
			}
			const fn = presets[name] || presets.iso
			fn()
			camera.up.set(0, 0, 1)
			camera.lookAt(target)
			controls.update()
		},
		setGizmoMode(mode) {
			const valid = mode === 'translate' || mode === 'rotate' || mode === 'scale'
			if (!valid) {
				gizmoMode = null
				detachGizmo()
				return
			}
			gizmoMode = mode
			if (!modelMesh) {
				return
			}
			ensureGizmo()
			gizmo.attach(modelMesh)
			gizmo.setMode(mode)
		},
		setGizmoChangeHandler(fn) {
			onGizmoChange = typeof fn === 'function' ? fn : null
		},
		resetTransform() {
			if (!modelMesh) {
				return
			}
			modelMesh.rotation.set(0, 0, 0)
			modelMesh.scale.set(1, 1, 1)
			centerMesh(modelMesh)
		},
		resetRotation() {
			if (!modelMesh) {
				return
			}
			modelMesh.rotation.set(0, 0, 0)
			centerMesh(modelMesh)
		},
		resetScale() {
			if (!modelMesh) {
				return
			}
			modelMesh.scale.set(1, 1, 1)
			centerMesh(modelMesh)
		},
		scaleModelAxis(vec) {
			if (!modelMesh || !Array.isArray(vec) || vec.length !== 3) {
				return
			}
			const [sx, sy, sz] = vec.map((v) => (Number.isFinite(v) && v > 0 ? v : 1))
			modelMesh.scale.set(
				modelMesh.scale.x * sx,
				modelMesh.scale.y * sy,
				modelMesh.scale.z * sz,
			)
			centerMesh(modelMesh)
		},
		translateModel(vec) {
			if (!modelMesh || !Array.isArray(vec) || vec.length !== 3) {
				return
			}
			modelMesh.position.x += Number.isFinite(vec[0]) ? vec[0] : 0
			modelMesh.position.y += Number.isFinite(vec[1]) ? vec[1] : 0
			modelMesh.position.z += Number.isFinite(vec[2]) ? vec[2] : 0
			modelMesh.updateMatrixWorld(true)
		},
		setPosition(vec) {
			if (!modelMesh || !Array.isArray(vec) || vec.length !== 3) {
				return
			}
			modelMesh.position.set(
				Number.isFinite(vec[0]) ? vec[0] : modelMesh.position.x,
				Number.isFinite(vec[1]) ? vec[1] : modelMesh.position.y,
				Number.isFinite(vec[2]) ? vec[2] : modelMesh.position.z,
			)
			modelMesh.updateMatrixWorld(true)
		},
		dropToBed() {
			if (!modelMesh) {
				return
			}
			modelMesh.updateMatrixWorld(true)
			const box = new THREE.Box3().setFromObject(modelMesh)
			modelMesh.position.z -= box.min.z
			modelMesh.updateMatrixWorld(true)
		},
		getWorldBounds() {
			if (!modelMesh) {
				return null
			}
			modelMesh.updateMatrixWorld(true)
			const box = new THREE.Box3().setFromObject(modelMesh)
			const center = box.getCenter(new THREE.Vector3())
			const size = box.getSize(new THREE.Vector3())
			return {
				min: [box.min.x, box.min.y, box.min.z],
				max: [box.max.x, box.max.y, box.max.z],
				center: [center.x, center.y, center.z],
				size: [size.x, size.y, size.z],
			}
		},
		isOnBed() {
			if (!modelMesh) {
				return true
			}
			modelMesh.updateMatrixWorld(true)
			const box = new THREE.Box3().setFromObject(modelMesh)
			const [bx, by] = bedVolume
			return box.min.x >= -0.5 && box.min.y >= -0.5 && box.min.z >= -0.5
				&& box.max.x <= bx + 0.5 && box.max.y <= by + 0.5
		},
		pickFaceNormal(clientX, clientY) {
			if (!modelMesh) {
				return null
			}
			const rect = canvas.getBoundingClientRect()
			const ndc = new THREE.Vector2(
				((clientX - rect.left) / rect.width) * 2 - 1,
				-((clientY - rect.top) / rect.height) * 2 + 1,
			)
			raycaster.setFromCamera(ndc, camera)
			const hits = raycaster.intersectObject(modelMesh, false)
			if (!hits.length || !hits[0].face) {
				return null
			}
			const normalMatrix = new THREE.Matrix3().getNormalMatrix(modelMesh.matrixWorld)
			const worldNormal = hits[0].face.normal.clone().applyMatrix3(normalMatrix).normalize()
			return { x: worldNormal.x, y: worldNormal.y, z: worldNormal.z }
		},
		setWireframe(on) {
			wireframe = !!on
			if (modelMesh) {
				modelMesh.material.wireframe = wireframe
			}
		},
		setSectionClip(state) {
			if (state && typeof state === 'object') {
				if (typeof state.enabled === 'boolean') {
					clipState.enabled = state.enabled
				}
				if (state.axis === 'x' || state.axis === 'y' || state.axis === 'z') {
					clipState.axis = state.axis
				}
				if (Number.isFinite(state.offset)) {
					clipState.offset = state.offset
				}
				if (typeof state.flip === 'boolean') {
					clipState.flip = state.flip
				}
			}
			applyClipPlane()
		},
		showCutPlane(axis, position01) {
			if (!modelMesh) {
				return null
			}
			modelMesh.updateMatrixWorld(true)
			const box = new THREE.Box3().setFromObject(modelMesh)
			const size = box.getSize(new THREE.Vector3())
			const ci = axis === 'x' ? 'x' : axis === 'y' ? 'y' : 'z'
			const min = box.min[ci]
			const max = box.max[ci]
			const t = Math.min(Math.max(position01, 0), 1)
			const offset = min + t * (max - min)
			if (!cutPlaneHelper) {
				const geo = new THREE.PlaneGeometry(1, 1)
				const mat = new THREE.MeshBasicMaterial({
					color: 0xf87171,
					transparent: true,
					opacity: 0.28,
					side: THREE.DoubleSide,
					depthWrite: false,
				})
				cutPlaneHelper = new THREE.Mesh(geo, mat)
				scene.add(cutPlaneHelper)
			}
			cutPlaneHelper.visible = true
			const w = Math.max(size.x, size.y, size.z, 40) * 1.4
			cutPlaneHelper.scale.set(w, w, 1)
			cutPlaneHelper.rotation.set(0, 0, 0)
			const cx = (box.min.x + box.max.x) / 2
			const cy = (box.min.y + box.max.y) / 2
			const cz = (box.min.z + box.max.z) / 2
			if (axis === 'x') {
				cutPlaneHelper.rotation.y = Math.PI / 2
				cutPlaneHelper.position.set(offset, cy, cz)
			} else if (axis === 'y') {
				cutPlaneHelper.rotation.x = Math.PI / 2
				cutPlaneHelper.position.set(cx, offset, cz)
			} else {
				cutPlaneHelper.position.set(cx, cy, offset)
			}
			return { offset, min, max }
		},
		hideCutPlane() {
			if (cutPlaneHelper) {
				cutPlaneHelper.visible = false
			}
		},
		/**
		 * Render a parsed toolpath (from src/services/toolpath-3d.js). Builds one
		 * THREE.LineSegments per feature type in the existing Z-up scene, hides the
		 * model mesh, and frames the camera. Colours are provided by the caller.
		 * @param {object} toolpath { layers: [{ z, features: { key: Float32Array }}], ... }
		 * @param {Record<string, number>} colorMap feature key -> hex colour
		 */
		showToolpath(toolpath, colorMap = {}) {
			this.disposeToolpath()
			if (!toolpath?.layers?.length) {
				return
			}
			// Hide the prepared mesh + gizmo while previewing toolpaths.
			detachGizmo()
			if (modelMesh) {
				modelMesh.visible = false
			}
			toolpathLayerCount = toolpath.layers.length
			toolpathGroup = new THREE.Group()

			// Concatenate each feature's segments across all layers into one buffer,
			// tracking the source layer index per vertex so a range slider can
			// show/hide layers via BufferGeometry draw ranges without rebuilds.
			const byFeature = new Map()
			toolpath.layers.forEach((layer, li) => {
				for (const [feat, arr] of Object.entries(layer.features || {})) {
					if (!arr?.length) {
						continue
					}
					let acc = byFeature.get(feat)
					if (!acc) {
						acc = { positions: [], layerOfVertex: [] }
						byFeature.set(feat, acc)
					}
					for (let i = 0; i < arr.length; i++) {
						acc.positions.push(arr[i])
					}
					// two vertices per segment -> 6 floats
					const verts = arr.length / 3
					for (let v = 0; v < verts; v++) {
						acc.layerOfVertex.push(li)
					}
				}
			})

			for (const [feat, acc] of byFeature.entries()) {
				const geom = new THREE.BufferGeometry()
				const pos = new Float32Array(acc.positions)
				geom.setAttribute('position', new THREE.BufferAttribute(pos, 3))
				const mat = new THREE.LineBasicMaterial({
					color: colorMap[feat] ?? 0x8b949e,
					transparent: feat === 'travel',
					opacity: feat === 'travel' ? 0.35 : 1,
				})
				const line = new THREE.LineSegments(geom, mat)
				line.visible = feat !== 'travel' // travel hidden by default
				toolpathGroup.add(line)
				toolpathLines.set(feat, {
					line,
					layerOfVertex: new Uint32Array(acc.layerOfVertex),
				})
			}
			scene.add(toolpathGroup)

			// Frame the camera to the toolpath bounds.
			const box = new THREE.Box3().setFromObject(toolpathGroup)
			if (!box.isEmpty()) {
				const center = box.getCenter(new THREE.Vector3())
				const size = box.getSize(new THREE.Vector3())
				const dist = Math.max(size.x, size.y, size.z, 40) * 2.2
				camera.position.set(center.x + dist * 0.6, center.y + dist * 0.6, center.z + dist * 0.5)
				controls.target.copy(center)
				camera.up.set(0, 0, 1)
				camera.lookAt(center)
				controls.update()
			}
			return { layerCount: toolpathLayerCount }
		},
		/**
		 * Limit visible layers to [0, maxLayer] (inclusive) via per-feature draw
		 * ranges. Cheap — no geometry rebuild.
		 * @param {number} maxLayer
		 */
		setToolpathLayerRange(maxLayer) {
			if (!toolpathGroup) {
				return
			}
			const cap = Number.isFinite(maxLayer) ? maxLayer : toolpathLayerCount
			for (const { line, layerOfVertex } of toolpathLines.values()) {
				// vertices are grouped by layer in ascending order, so find the count
				// of vertices whose layer <= cap.
				let count = layerOfVertex.length
				for (let i = 0; i < layerOfVertex.length; i++) {
					if (layerOfVertex[i] > cap) {
						count = i
						break
					}
				}
				line.geometry.setDrawRange(0, count)
			}
		},
		setToolpathFeatureVisible(feature, visible) {
			const entry = toolpathLines.get(feature)
			if (entry) {
				entry.line.visible = !!visible
			}
		},
		disposeToolpath() {
			if (toolpathGroup) {
				for (const { line } of toolpathLines.values()) {
					line.geometry.dispose()
					line.material.dispose()
				}
				scene.remove(toolpathGroup)
				toolpathGroup = null
				toolpathLines.clear()
				toolpathLayerCount = 0
			}
			if (modelMesh) {
				modelMesh.visible = true
			}
		},
		getTransform() {
			if (!modelMesh) {
				return null
			}
			const box = new THREE.Box3().setFromObject(modelMesh)
			const size = box.getSize(new THREE.Vector3())
			return {
				position: [modelMesh.position.x, modelMesh.position.y, modelMesh.position.z],
				rotation: [modelMesh.rotation.x, modelMesh.rotation.y, modelMesh.rotation.z],
				scale: [modelMesh.scale.x, modelMesh.scale.y, modelMesh.scale.z],
				bbox: { x: size.x, y: size.y, z: size.z },
			}
		},
		setTransform(transform) {
			if (!modelMesh || !transform) {
				return
			}
			if (Array.isArray(transform.position) && transform.position.length === 3) {
				modelMesh.position.set(...transform.position)
			}
			if (Array.isArray(transform.rotation) && transform.rotation.length === 3) {
				modelMesh.rotation.set(...transform.rotation)
			}
			if (Array.isArray(transform.scale) && transform.scale.length === 3) {
				modelMesh.scale.set(...transform.scale)
			}
			frameCamera()
		},
		async exportTransformedMesh() {
			if (!modelMesh?.geometry) {
				return null
			}
			const geom = modelMesh.geometry.clone()
			modelMesh.updateMatrixWorld(true)
			geom.applyMatrix4(modelMesh.matrixWorld)
			const posAttr = geom.attributes.position
			if (!posAttr) {
				return null
			}
			const positions = new Float32Array(posAttr.array)
			let indices
			if (geom.index) {
				indices = new Uint32Array(geom.index.array)
			} else {
				const count = posAttr.count
				indices = new Uint32Array(count)
				for (let i = 0; i < count; i++) {
					indices[i] = i
				}
			}
			let minX = Infinity
			let minY = Infinity
			let minZ = Infinity
			let maxX = -Infinity
			let maxY = -Infinity
			let maxZ = -Infinity
			for (let i = 0; i < positions.length; i += 3) {
				minX = Math.min(minX, positions[i])
				maxX = Math.max(maxX, positions[i])
				minY = Math.min(minY, positions[i + 1])
				maxY = Math.max(maxY, positions[i + 1])
				minZ = Math.min(minZ, positions[i + 2])
				maxZ = Math.max(maxZ, positions[i + 2])
			}
			geom.dispose()
			return {
				positions,
				indices,
				bbox: { x: maxX - minX, y: maxY - minY, z: maxZ - minZ },
			}
		},
		getModelMeta() {
			return modelMeta
		},
	}
}
