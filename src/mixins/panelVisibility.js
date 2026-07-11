/**
 * Panel-visibility reporter for zoned Print-tab panels.
 *
 * Some monitoring panels self-gate on fetched, panel-internal data (sensors,
 * webcams, spools, queue exclude-objects, timelapse support) that the parent
 * PrintTab can't cheaply mirror. To fold these into the collapsible/pinnable
 * zones without showing an empty header, each such panel:
 *   1. defines a `panelVisible` computed (its own "do I have content?" gate), and
 *   2. mixes this in — it emits `visible` (boolean) on mount and whenever the
 *      gate flips, so PrintPanel's `:when` tracks it and the wrapper header
 *      appears/disappears in lockstep.
 *
 * A panel using this mixin renders ONLY its body content (no outer card/title —
 * PrintPanel provides those). Its template should still guard on `panelVisible`
 * so it renders nothing when empty even if used standalone.
 */
export const panelVisibility = {
	computed: {
		// Panels MUST override `panelVisible`. Default false is a safe fallback
		// (nothing shown) if a panel forgets to define it.
		panelVisible() {
			return false
		},
	},
	watch: {
		panelVisible: {
			immediate: true,
			handler(now) {
				this.$emit('visible', !!now)
			},
		},
	},
}

export default panelVisibility
