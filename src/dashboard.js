import Vue from 'vue'
import DashboardWidget from './components/DashboardWidget.vue'

/**
 * Registers the "3D printer status" dashboard widget with Nextcloud. NC calls
 * the registered callback with the mount element when the widget becomes
 * visible; we mount a small self-contained Vue app that polls printer state.
 */
document.addEventListener('DOMContentLoaded', () => {
	if (!window.OCA?.Dashboard) {
		return
	}
	window.OCA.Dashboard.register('nc_print_printer_status', (el) => {
		const View = Vue.extend(DashboardWidget)
		new View().$mount(el)
	})
})
