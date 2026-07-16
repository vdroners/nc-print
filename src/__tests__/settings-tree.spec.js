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
const perObject = read('../components/PerObjectSettingsPanel.vue')
const store = read('../store/print.js')

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

describe('per-object settings (v1.66) — source', () => {
	it('OverrideField supports an optional per-object model binding', () => {
		expect(overrideField).toMatch(/model: \{ type: Object/)
		expect(overrideField).toMatch(/isPerObject/)
		expect(overrideField).toMatch(/v-model="value"/) // binds to the model or global
	})

	it('PerObjectSettingsPanel binds OverrideField to the selected object overrides', () => {
		expect(perObject).toMatch(/:model="overrides"/)
		expect(perObject).toMatch(/selectedObjectId/)
		expect(perObject).toMatch(/isMultiObject/) // only shown for a real multi-object scene
		expect(perObject).toMatch(/FILAMENT_SCOPED/) // hides filament-scoped keys
	})

	it('PrepareOverrides hosts the per-object panel', () => {
		expect(prepareOverrides).toMatch(/PerObjectSettingsPanel/)
	})

	it('store maps per-object overrides through buildSliceOverrides, index-aligned', () => {
		expect(store).toMatch(/objectOverrides = this\.sceneSliceFiles\.map/)
		expect(store).toMatch(/buildSliceOverrides\(cleanOverrides\(this\.objects\[i\]\?\.overrides/)
		// _defaultObject seeds an overrides map + snapshot deep-copies it
		expect(store).toMatch(/overrides: \{ \.\.\.\(meta\.overrides \|\| \{\}\) \}/)
	})
})
