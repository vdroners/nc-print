/**
 * Workflow tab identifiers.
 *
 * These live in their own dependency-free leaf module (imported by both the
 * Pinia store and the Vue components) so a component never depends on the
 * heavy `store/print.js` module having finished evaluating just to read a
 * constant. Importing `TABS` from the store instead created a webpack
 * module-initialization order hazard where `TABS` could resolve to
 * `undefined` in the production bundle — which silently broke the workflow
 * tab bar's render. Keep this module free of imports.
 */
export const TABS = Object.freeze({
	PREPARE: 'prepare',
	SLICE: 'slice',
	PRINT: 'print',
})
