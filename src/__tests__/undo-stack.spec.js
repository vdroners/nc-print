import { describe, it, expect } from 'vitest'
import { createUndoStack } from '@/utils/undo-stack.js'

const t = (px, ry = 0, sz = 1) => ({ position: [px, 0, 0], rotation: [0, ry, 0], scale: [sz, sz, sz] })

describe('createUndoStack', () => {
	it('starts empty — nothing to undo or redo', () => {
		const s = createUndoStack()
		expect(s.canUndo()).toBe(false)
		expect(s.canRedo()).toBe(false)
		expect(s.current()).toBeNull()
		expect(s.undo()).toBeNull()
	})

	it('push then undo returns the previous state; redo returns forward', () => {
		const s = createUndoStack()
		s.push(t(0))
		s.push(t(10))
		s.push(t(20))
		expect(s.canUndo()).toBe(true)
		expect(s.canRedo()).toBe(false)
		expect(s.undo().position[0]).toBe(10)
		expect(s.undo().position[0]).toBe(0)
		expect(s.canUndo()).toBe(false)
		expect(s.redo().position[0]).toBe(10)
		expect(s.redo().position[0]).toBe(20)
		expect(s.canRedo()).toBe(false)
	})

	it('dedupes identical consecutive pushes', () => {
		const s = createUndoStack()
		s.push(t(5))
		s.push(t(5))
		s.push(t(5))
		expect(s.size()).toBe(1)
		expect(s.canUndo()).toBe(false)
	})

	it('a push after undo truncates the redo tail', () => {
		const s = createUndoStack()
		s.push(t(0))
		s.push(t(10))
		s.push(t(20))
		s.undo() // back to 10
		s.push(t(99)) // new branch — 20 is discarded
		expect(s.canRedo()).toBe(false)
		expect(s.current().position[0]).toBe(99)
		expect(s.undo().position[0]).toBe(10)
	})

	it('enforces the bound, dropping the oldest', () => {
		const s = createUndoStack(3)
		s.push(t(1))
		s.push(t(2))
		s.push(t(3))
		s.push(t(4)) // drops t(1)
		expect(s.size()).toBe(3)
		// can undo 4->3->2, then stop (1 was dropped)
		expect(s.undo().position[0]).toBe(3)
		expect(s.undo().position[0]).toBe(2)
		expect(s.canUndo()).toBe(false)
	})

	it('reset clears all history', () => {
		const s = createUndoStack()
		s.push(t(1))
		s.push(t(2))
		s.reset()
		expect(s.size()).toBe(0)
		expect(s.canUndo()).toBe(false)
		expect(s.current()).toBeNull()
	})

	it('returns cloned snapshots (mutating the result does not corrupt history)', () => {
		const s = createUndoStack()
		s.push(t(1))
		s.push(t(2))
		const snap = s.undo()
		snap.position[0] = 999
		expect(s.current().position[0]).toBe(1) // unchanged
	})
})
