const path = require('path')
const { defineConfig } = require('vitest/config')

module.exports = defineConfig({
	test: {
		environment: 'node',
		environmentMatchGlobs: [
			['src/__tests__/mesh-convert.spec.js', 'happy-dom'],
			['src/__tests__/mesh-state.spec.js', 'happy-dom'],
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
