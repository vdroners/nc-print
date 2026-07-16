/**
 * @vitest-environment node
 * Source-regex guards for the v1.65 settings tree: ProfileQuickEdit is now
 * data-driven (renders OVERRIDE_FIELD_DEFS via <OverrideField>) with a
 * Simple/Advanced/Expert mode toggle + search; OverrideField carries the
 * is-modified + reset chrome; PrepareOverrides shows the unsaved-vs-preset dot.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const quickEdit = read('../components/ProfileQuickEdit.vue')
const overrideField = read('../components/OverrideField.vue')
const prepareOverrides = read('../components/PrepareOverrides.vue')

describe('settings tree (v1.65) — source', () => {
	it('ProfileQuickEdit is data-driven: v-for over groupsForMode → OverrideField', () => {
		expect(quickEdit).toMatch(/groupsForMode/)
		expect(quickEdit).toMatch(/<OverrideField/)
		expect(quickEdit).toMatch(/v-for="def in g\.fields"/)
		// It no longer hand-writes ~15 sections of <input v-model="printStore.overrides…">
		expect(quickEdit).not.toMatch(/printStore\.overrides\.\w+/)
	})

	it('ProfileQuickEdit has the mode toggle + search + persists via store', () => {
		expect(quickEdit).toMatch(/setSettingsMode/)
		expect(quickEdit).toMatch(/type="search"/)
		expect(quickEdit).toMatch(/Simple/)
		expect(quickEdit).toMatch(/Expert/)
		// prime-tower group still gated to multi-material
		expect(quickEdit).toMatch(/isMultiMaterial/)
		expect(quickEdit).toMatch(/MULTI_MATERIAL_GROUPS/)
	})

	it('OverrideField encapsulates the is-modified + reset chrome once', () => {
		expect(overrideField).toMatch(/isOverrideModified/)
		expect(overrideField).toMatch(/resetOverrideField/)
		expect(overrideField).toMatch(/is-modified/)
		// handles all four input kinds
		expect(overrideField).toMatch(/isCheckbox/)
		expect(overrideField).toMatch(/isSelect/)
		expect(overrideField).toMatch(/type="number"/)
	})

	it('PrepareOverrides surfaces the unsaved-vs-preset dot', () => {
		expect(prepareOverrides).toMatch(/presetDirty/)
		expect(prepareOverrides).toMatch(/activePresetName/)
		expect(prepareOverrides).toMatch(/nc-print-preset-status__dot/)
	})
})
