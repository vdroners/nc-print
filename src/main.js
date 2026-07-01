import Vue from 'vue'
import { PiniaVuePlugin, createPinia } from 'pinia'
import App from './App.vue'

Vue.use(PiniaVuePlugin)

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
