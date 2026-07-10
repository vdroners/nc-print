const path = require('path')
const { merge } = require('webpack-merge')
const baseConfig = require('@nextcloud/webpack-vue-config')
const webpack = require('webpack')
const pkg = require('./package.json')

module.exports = merge(baseConfig, {
	entry: {
		main: path.resolve(__dirname, 'src', 'main.js'),
		admin: path.resolve(__dirname, 'src', 'admin-settings.js'),
		dashboard: path.resolve(__dirname, 'src', 'dashboard.js'),
		'files-action': path.resolve(__dirname, 'src', 'files-action', 'index.js'),
	},
	output: {
		publicPath: 'auto',
		filename: (chunkData) => {
			const n = chunkData.chunk.name
			if (n === 'files-action') {
				return 'nc_print-[name].mjs'
			}
			return 'nc_print-[name].js'
		},
		chunkFilename: 'nc_print-[name].js?v=[contenthash]',
	},
	resolve: {
		alias: {
			'@': path.resolve(__dirname, 'src'),
		},
	},
	plugins: [
		new webpack.DefinePlugin({
			__NC_PRINT_FRONTEND_VERSION__: JSON.stringify(pkg.version || '0.0.0'),
		}),
	],
	optimization: {
		// Split only ASYNC (dynamically-imported) chunks — the lazy tab chunks,
		// Three.js, and the store's dynamic mesh-convert/mesh-analyze imports.
		// NOT 'all': Nextcloud injects only the named entry script, so splitting
		// the entry's INITIAL vendor code produces a sibling chunk NC never loads
		// (verified: the app shell mounts but tabs/store never arrive). 'async'
		// keeps each entry self-contained while still deferring on-demand code
		// (JSZip, Three.js) out of the startup path.
		splitChunks: { chunks: 'async' },
	},
})
