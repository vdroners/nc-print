/**
 * Text → 3D mesh for the emboss / deboss tool.
 *
 * Builds an extruded solid from a text string using three's TextGeometry + a
 * bundled font (helvetiker regular, imported so it's in the webpack bundle — no
 * network fetch), oriented so the extrusion runs along a target face normal and
 * centred at a target point. The caller then CSG-unions (emboss) or -subtracts
 * (deboss) it with the model via mesh-boolean.js.
 *
 * Returns the app's plain {positions, indices} triangle-soup shape.
 */
import * as THREE from 'three'
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js'
import { Font } from 'three/examples/jsm/loaders/FontLoader.js'
import helvetiker from 'three/examples/fonts/helvetiker_regular.typeface.json'

let _font = null
function font() {
	if (!_font) {
		_font = new Font(helvetiker)
	}
	return _font
}

function geoToMesh(geo) {
	const nonIndexed = geo.index ? geo.toNonIndexed() : geo
	const positions = new Float32Array(nonIndexed.getAttribute('position').array)
	const indices = new Uint32Array(positions.length / 3)
	for (let i = 0; i < indices.length; i++) {
		indices[i] = i
	}
	return { positions, indices }
}

/**
 * @param {object} opts
 * @param {string} opts.text
 * @param {number} [opts.size] cap height (mm)
 * @param {number} [opts.depth] extrusion depth (mm)
 * @param {[number,number,number]} opts.point world point to centre the text on
 * @param {[number,number,number]} opts.normal target face normal (extrusion dir)
 * @param {number} [opts.inset] push the text slightly into the surface so a union
 *   fuses cleanly / a subtract fully clears (mm)
 * @returns {{positions: Float32Array, indices: Uint32Array}|null}
 */
export function makeTextMesh({ text, size = 6, depth = 1, point, normal, inset = 0.2 }) {
	const str = String(text || '').trim()
	if (!str) {
		return null
	}
	const geo = new TextGeometry(str, {
		font: font(),
		size,
		depth,
		curveSegments: 4,
		bevelEnabled: false,
	})
	geo.computeBoundingBox()
	const bb = geo.boundingBox
	// Centre the text on origin in its local frame (XY plane, +Z extrusion).
	const cx = (bb.max.x + bb.min.x) / 2
	const cy = (bb.max.y + bb.min.y) / 2
	geo.translate(-cx, -cy, -depth) // back face at z=0, text extrudes toward -Z origin side

	// Orient local +Z to the target normal, then move to the hit point (pushed in
	// by `inset` so union/subtract overlaps the surface).
	const from = new THREE.Vector3(0, 0, 1)
	const to = new THREE.Vector3(normal[0], normal[1], normal[2]).normalize()
	const quat = new THREE.Quaternion().setFromUnitVectors(from, to)
	geo.applyQuaternion(quat)
	const p = new THREE.Vector3(point[0], point[1], point[2])
		.addScaledVector(to, -inset)
	geo.translate(p.x, p.y, p.z)

	return geoToMesh(geo)
}
