const path = require('path')
const { defineConfig } = require('vitest/config')

module.exports = defineConfig({
	test: {
		environment: 'node',
		include: ['src/__tests__/**/*.spec.js'],
		clearMocks: true,
	},
	resolve: {
		alias: {
			'@': path.resolve(__dirname, 'src'),
		},
	},
})
