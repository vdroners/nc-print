import { describe, it, expect } from 'vitest'
import { isAcceptedModel, isGcode, classifyDrop } from '@/utils/drop-accept.js'

describe('drop-accept', () => {
	it('recognizes model extensions (case-insensitive)', () => {
		expect(isAcceptedModel('part.stl')).toBe(true)
		expect(isAcceptedModel('PART.STL')).toBe(true)
		expect(isAcceptedModel('multi.3mf')).toBe(true)
		expect(isAcceptedModel('mesh.obj')).toBe(true)
		expect(isAcceptedModel('doc.pdf')).toBe(false)
	})

	it('recognizes g-code incl. .gcode.gz', () => {
		expect(isGcode('job.gcode')).toBe(true)
		expect(isGcode('job.GCODE')).toBe(true)
		expect(isGcode('job.gcode.gz')).toBe(true)
		expect(isGcode('part.stl')).toBe(false)
	})

	it('classifyDrop routes model / gcode / unsupported', () => {
		expect(classifyDrop('benchy.stl')).toBe('model')
		expect(classifyDrop('plate.3mf')).toBe('model')
		expect(classifyDrop('job.gcode')).toBe('gcode')
		expect(classifyDrop('job.gcode.gz')).toBe('gcode')
		expect(classifyDrop('notes.txt')).toBe('unsupported')
	})

	it('rejects empty / no-extension names', () => {
		expect(classifyDrop('')).toBe('unsupported')
		expect(classifyDrop('noextension')).toBe('unsupported')
		expect(classifyDrop(null)).toBe('unsupported')
	})

	it('does not treat "gcode" as a substring match without the dot', () => {
		expect(classifyDrop('mygcodefile')).toBe('unsupported')
		expect(classifyDrop('stlmodel')).toBe('unsupported')
	})
})
