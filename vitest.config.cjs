const path = require('path')
const { defineConfig } = require('vitest/config')

module.exports = defineConfig({
	test: {
		// Default every spec to happy-dom so a new store/DOM-touching spec never
		// silently runs in the wrong environment (the old per-file glob list was
		// a footgun — a forgotten entry ran under `node` and failed). happy-dom is
		// a superset for our pure-logic specs, so this is safe and removes the
		// maintenance burden.
		environment: 'happy-dom',
		include: ['src/__tests__/**/*.spec.js'],
		clearMocks: true,
	},
	resolve: {
		alias: {
			'@': path.resolve(__dirname, 'src'),
		},
	},
})
