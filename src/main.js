import Vue from 'vue'
import { PiniaVuePlugin, createPinia } from 'pinia'
import App from './App.vue'

Vue.use(PiniaVuePlugin)

// Surface component render/lifecycle errors instead of silently rendering an
// empty node (Vue 2's default), which can make a whole sub-tree "disappear".
// Errors are logged with a stable prefix and the most recent few are kept on
// window for support/diagnostics.
Vue.config.errorHandler = (err, vm, info) => {
	const name = vm?.$options?.name || vm?.$options?._componentTag || 'unknown'
	// eslint-disable-next-line no-console
	console.error(`[nc_print] render error in <${name}> (${info}):`, err)
	try {
		const store = (window.__ncPrintErrors = window.__ncPrintErrors || [])
		store.push({ component: name, info, message: err?.message || String(err), stack: err?.stack })
		if (store.length > 20) {
			store.shift()
		}
	} catch {
		// ignore
	}
}

const pinia = createPinia()
const el = document.getElementById('nc-print-root')

if (!el) {
	console.debug('[nc_print] No #nc-print-root — skipping mount.')
} else {
	const mountTarget = document.createElement('div')
	mountTarget.className = 'nc-print-mount'
	el.appendChild(mountTarget)

	new Vue({
		el: mountTarget,
		pinia,
		render: h => h(App),
	})
}
