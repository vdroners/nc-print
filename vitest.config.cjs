const path = require('path')
const { defineConfig } = require('vitest/config')

module.exports = defineConfig({
	test: {
		environment: 'node',
		environmentMatchGlobs: [
			['src/__tests__/mesh-convert.spec.js', 'happy-dom'],
			['src/__tests__/mesh-state.spec.js', 'happy-dom'],
			['src/__tests__/print-monitor.spec.js', 'happy-dom'],
			['src/__tests__/console.spec.js', 'happy-dom'],
			['src/__tests__/slice-stats.spec.js', 'happy-dom'],
			['src/__tests__/materials.spec.js', 'happy-dom'],
			['src/__tests__/eta.spec.js', 'happy-dom'],
			['src/__tests__/printers.spec.js', 'happy-dom'],
			['src/__tests__/events.spec.js', 'happy-dom'],
		],
		include: ['src/__tests__/**/*.spec.js'],
		clearMocks: true,
	},
	resolve: {
		alias: {
			'@': path.resolve(__dirname, 'src'),
		},
	},
})
