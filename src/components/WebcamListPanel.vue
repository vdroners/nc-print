<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { moonrakerGet } from '@/services/moonraker-api.js'
import { panelVisibility } from '@/mixins/panelVisibility.js'

/**
 * Lists the webcams Moonraker knows about (name, service, resolution). Shown
 * when the printer reports the `webcam` component AND more than one camera
 * exists — so a multi-camera setup can see what's available. Live streaming
 * still flows through the admin-configured camera proxy (the app never streams a
 * raw LAN URL a user supplies, by security design); this panel is informational
 * + selects which camera the operator is looking at. Rendered inside a PrintPanel
 * zone wrapper, so it emits `visible` and renders body-only (no card/title).
 */
export default {
	name: 'WebcamListPanel',
	mixins: [panelVisibility],
	data() {
		return {
			webcams: [],
			selected: '',
			loadError: '',
		}
	},
	computed: {
		...mapStores(usePrintStore),
		printerId() {
			return this.printStore.selectedPrinterId || undefined
		},
		supported() {
			return this.printStore.hasFeature('webcam')
		},
		connected() {
			return this.printStore.printerState.connected
		},
		show() {
			return this.supported && this.webcams.length > 1
		},
		panelVisible() {
			return this.show
		},
	},
	watch: {
		connected(now) {
			if (now && this.supported) {
				void this.load()
			}
		},
	},
	mounted() {
		if (this.connected && this.supported) {
			void this.load()
		}
	},
	methods: {
		async load() {
			try {
				const res = await moonrakerGet('server/webcams/list', {}, this.printerId)
				const list = res?.result?.webcams ?? res?.webcams ?? []
				this.webcams = Array.isArray(list) ? list : []
				if (this.webcams.length && !this.selected) {
					this.selected = this.webcams[0].name || this.webcams[0].uid || ''
				}
				this.loadError = ''
			} catch (e) {
				this.loadError = e?.message || 'Could not load webcams'
			}
		},
	},
}
</script>

<template>
	<div v-if="panelVisible" class="nc-print-webcams">
		<p v-if="loadError" class="nc-print-webcams__error">{{ loadError }}</p>
		<div class="nc-print-webcams__list">
			<label
				v-for="cam in webcams"
				:key="cam.name || cam.uid"
				class="nc-print-webcams__item">
				<input
					type="radio"
					name="nc-print-webcam"
					:value="cam.name || cam.uid"
					v-model="selected">
				<span class="nc-print-webcams__name">{{ cam.name || cam.uid }}</span>
				<span v-if="cam.service" class="nc-print-webcams__meta">{{ cam.service }}</span>
			</label>
		</div>
		<p class="nc-print-webcams__hint">
			Live view uses the admin-configured camera. Configure per-camera
			streaming in Settings → NC 3D Print.
		</p>
	</div>
</template>

<style scoped>
.nc-print-webcams__title { font-size: var(--nc-gcs-text-sm); font-weight: 600; margin: var(--nc-gcs-space-sm) 0; }
.nc-print-webcams__error { font-size: 0.8rem; color: var(--color-error, #e5534b); margin: 0; }
.nc-print-webcams__list { display: flex; flex-direction: column; gap: 4px; }
.nc-print-webcams__item { display: flex; align-items: center; gap: 8px; font-size: 0.84rem; cursor: pointer; }
.nc-print-webcams__meta { font-size: 0.72rem; color: var(--color-text-maxcontrast, #8b949e); }
.nc-print-webcams__hint { font-size: 0.72rem; color: var(--color-text-maxcontrast, #8b949e); margin: 4px 0 0; }
</style>
