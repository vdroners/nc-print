/**
 * A tiny bounded undo/redo stack of transform snapshots for the Prepare editor.
 *
 * Deliberately snapshot-based (not command/inverse-command): a snapshot is a
 * plain, serializable transform `{ position:[x,y,z], rotation:[x,y,z],
 * scale:[x,y,z] }`. Every committed transform change pushes the NEW state; undo
 * moves the cursor back and returns the state to re-apply; redo moves forward.
 * Pure + framework-free so it's unit-testable and shared by the store.
 *
 * The stack holds `[oldest … newest]`; `cursor` points at the currently-applied
 * snapshot. A push after an undo truncates the redo tail (standard editor
 * behavior).
 */

const DEFAULT_LIMIT = 50

export function createUndoStack(limit = DEFAULT_LIMIT) {
	/** @type {object[]} */
	let stack = []
	let cursor = -1 // index of the applied snapshot; -1 = empty

	const clone = (s) => (s == null ? null : {
		position: [...(s.position || [0, 0, 0])],
		rotation: [...(s.rotation || [0, 0, 0])],
		scale: [...(s.scale || [1, 1, 1])],
	})

	const same = (a, b) => {
		if (!a || !b) {
			return false
		}
		const eq = (u, v) => u.length === v.length && u.every((n, i) => Math.abs(n - v[i]) < 1e-6)
		return eq(a.position, b.position) && eq(a.rotation, b.rotation) && eq(a.scale, b.scale)
	}

	return {
		/**
		 * Record a new applied state. No-ops if identical to the current top
		 * (avoids flooding the stack with debounced duplicate transforms).
		 * @param {object} snapshot
		 */
		push(snapshot) {
			const snap = clone(snapshot)
			if (!snap) {
				return
			}
			if (cursor >= 0 && same(stack[cursor], snap)) {
				return
			}
			// truncate any redo tail
			if (cursor < stack.length - 1) {
				stack = stack.slice(0, cursor + 1)
			}
			stack.push(snap)
			// enforce the bound from the front
			if (stack.length > limit) {
				stack = stack.slice(stack.length - limit)
			}
			cursor = stack.length - 1
		},

		/** @returns {boolean} */
		canUndo() {
			return cursor > 0
		},
		/** @returns {boolean} */
		canRedo() {
			return cursor >= 0 && cursor < stack.length - 1
		},

		/**
		 * Step back one state. Returns the snapshot to re-apply, or null if
		 * nothing to undo.
		 * @returns {object|null}
		 */
		undo() {
			if (!this.canUndo()) {
				return null
			}
			cursor -= 1
			return clone(stack[cursor])
		},

		/**
		 * Step forward one state. Returns the snapshot to re-apply, or null.
		 * @returns {object|null}
		 */
		redo() {
			if (!this.canRedo()) {
				return null
			}
			cursor += 1
			return clone(stack[cursor])
		},

		/** Drop all history (e.g. on loading a new model). */
		reset() {
			stack = []
			cursor = -1
		},

		/** Current applied snapshot (or null). */
		current() {
			return cursor >= 0 ? clone(stack[cursor]) : null
		},

		/** @returns {number} number of snapshots retained (for tests/debug). */
		size() {
			return stack.length
		},
	}
}
