/**
 * Arrange multiple objects on the bed without overlap — a client-side shelf
 * (row) packer. Objects are placed left→right in rows, wrapping when a row
 * exceeds the bed width, sorted largest-footprint first so big parts anchor the
 * layout. Returns per-object target CENTER positions (x,y keep each object's
 * current z). The caller translates each object to its target.
 *
 * Input objects: [{ id, bbox: {x,y}, center: [x,y,z] }] where bbox is the
 * footprint size (mm). buildVolume: [bx, by, bz].
 */

/**
 * @param {Array<{id:string, size:[number,number], z:number}>} items
 *   size = [footprintX, footprintY] (mm); z = keep-current z of the object centre
 * @param {[number,number,number]} buildVolume
 * @param {number} [gap] spacing between parts (mm)
 * @returns {{placements: Array<{id:string, center:[number,number,number]}>, ok:boolean, overflow:number}}
 */
export function arrangeObjects(items, buildVolume, gap = 5) {
	const [bx, by] = buildVolume
	const list = [...items].sort((a, b) => (b.size[0] * b.size[1]) - (a.size[0] * a.size[1]))
	const placements = []
	let overflow = 0

	let cursorX = gap
	let cursorY = gap
	let rowHeight = 0

	for (const it of list) {
		const w = it.size[0]
		const d = it.size[1]
		// Wrap to a new row when this part would exceed the bed width.
		if (cursorX + w + gap > bx && cursorX > gap) {
			cursorX = gap
			cursorY += rowHeight + gap
			rowHeight = 0
		}
		// Part that doesn't fit the bed at all → leave it, count as overflow.
		if (w + gap * 2 > bx || cursorY + d + gap > by) {
			overflow++
			// Still give it a placement (clamped) so it isn't lost off-bed.
			const cxOv = Math.min(Math.max(cursorX + w / 2, w / 2), bx - w / 2)
			const cyOv = Math.min(Math.max(cursorY + d / 2, d / 2), by - d / 2)
			placements.push({ id: it.id, center: [cxOv, cyOv, it.z] })
			cursorX += w + gap
			rowHeight = Math.max(rowHeight, d)
			continue
		}
		const cx = cursorX + w / 2
		const cy = cursorY + d / 2
		placements.push({ id: it.id, center: [cx, cy, it.z] })
		cursorX += w + gap
		rowHeight = Math.max(rowHeight, d)
	}

	return { placements, ok: overflow === 0, overflow }
}
