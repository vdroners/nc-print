<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import PrintWorkflowBanner from './PrintWorkflowBanner.vue'
import ServiceHealthBanner from './ServiceHealthBanner.vue'
import NcPrintIcon from './NcPrintIcon.vue'
import { TABS } from '@/constants/tabs.js'
import {
	DENSITY_COMFORTABLE,
	applyDensityToRoot,
	densityLabel,
	readDensityPref,
	toggleDensityPref,
} from '@/utils/density-pref.js'

export default {
	name: 'AppChromeBar',
	components: { PrintWorkflowBanner, ServiceHealthBanner, NcPrintIcon },
	data() {
		return {
			notifPermission: typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
			density: readDensityPref(),
		}
	},
	methods: {
		async onBellClick() {
			const result = await this.printStore.requestPrintNotifications()
			if (typeof Notification !== 'undefined') {
				this.notifPermission = Notification.permission
			} else {
				this.notifPermission = result
			}
		},
		onOverviewClick() {
			// Overview is a management console, not a workflow step — toggle back
			// to Prepare on a second click for quick in/out.
			const next = this.printStore.activeTab === TABS.OVERVIEW ? TABS.PREPARE : TABS.OVERVIEW
			this.printStore.setActiveTab(next)
		},
		onDensityClick() {
			this.density = toggleDensityPref()
			applyDensityToRoot(this.density)
		},
		syncDensityFromRoot() {
			this.density = readDensityPref()
		},
	},
	mounted() {
		window.addEventListener('nc-print-density-changed', this.syncDensityFromRoot)
	},
	beforeDestroy() {
		window.removeEventListener('nc-print-density-changed', this.syncDensityFromRoot)
	},
	computed: {
		...mapStores(usePrintStore),
		overviewActive() {
			return this.printStore.activeTab === TABS.OVERVIEW
		},
		densityTitle() {
			const next = this.density === DENSITY_COMFORTABLE ? 'Ultrawide' : 'Comfortable'
			return `Density: ${densityLabel(this.density)} (click for ${next})`
		},
		densityShort() {
			return this.density === DENSITY_COMFORTABLE ? '1680' : 'Wide'
		},
		notifSupported() {
			return this.notifPermission !== 'unsupported'
		},
		notifIcon() {
			return this.notifPermission === 'granted' ? 'bell' : 'bell-off'
		},
		notifTitle() {
			if (!this.notifSupported) {
				return 'Browser notifications are not supported here'
			}
			if (this.notifPermission === 'granted') {
				return 'Print-complete / print-failed notifications are on'
			}
			if (this.notifPermission === 'denied') {
				return 'Notifications blocked — enable them in your browser site settings'
			}
			return 'Enable browser notifications for print complete / failed'
		},
	},
}
</script>

<template>
	<div class="nc-print-chrome-bar">
		<div class="nc-print-chrome-bar__row">
			<PrintWorkflowBanner class="nc-print-chrome-bar__workflow" />
			<div class="nc-print-chrome-bar__actions">
				<button
					type="button"
					class="nc-print-btn nc-print-chrome-bar__density"
					:class="{ 'nc-print-chrome-bar__density--comfortable': density === 'comfortable' }"
					:aria-label="densityTitle"
					:title="densityTitle"
					@click="onDensityClick">
					<span class="nc-print-chrome-bar__density-label">{{ densityShort }}</span>
				</button>
				<button
					type="button"
					class="nc-print-btn nc-print-chrome-bar__overview"
					:class="{ 'nc-print-chrome-bar__overview--on': overviewActive }"
					:aria-current="overviewActive ? 'page' : undefined"
					aria-label="Overview — printers, materials, history & more"
					title="Overview — printers, materials, history & more"
					@click="onOverviewClick">
					<NcPrintIcon name="cog" :size="16" />
					<span class="nc-print-chrome-bar__overview-label">Overview</span>
				</button>
				<button
					v-if="notifSupported"
					type="button"
					class="nc-print-btn nc-print-btn--icon nc-print-chrome-bar__bell"
					:class="{ 'nc-print-chrome-bar__bell--on': notifPermission === 'granted' }"
					:aria-label="notifTitle"
					:title="notifTitle"
					@click="onBellClick">
					<NcPrintIcon :name="notifIcon" :size="18" />
				</button>
			</div>
		</div>
		<ServiceHealthBanner />
	</div>
</template>

<style scoped>
.nc-print-chrome-bar__row {
	align-items: center;
	display: flex;
	gap: var(--nc-gcs-space-md);
}

.nc-print-chrome-bar__workflow {
	flex: 1 1 auto;
	min-width: 0;
	margin-bottom: 0;
}

.nc-print-chrome-bar__actions {
	align-items: center;
	display: flex;
	flex: 0 0 auto;
	gap: var(--nc-gcs-space-sm);
}

.nc-print-chrome-bar__bell--on {
	border-color: color-mix(in srgb, var(--nc-app-accent) 60%, var(--nc-gcs-border));
	color: var(--nc-app-accent);
}

.nc-print-chrome-bar__density {
	flex: 0 0 auto;
	font-size: 11px;
	font-weight: 600;
	letter-spacing: 0.02em;
	padding: 6px 8px;
	white-space: nowrap;
}

.nc-print-chrome-bar__density--comfortable {
	background: color-mix(in srgb, var(--nc-gcs-primary) 12%, transparent);
	border-color: var(--nc-gcs-primary);
	color: var(--nc-gcs-primary);
}

.nc-print-chrome-bar__overview {
	flex: 0 0 auto;
	font-size: 12px;
	font-weight: 600;
	gap: 6px;
	padding: 6px 10px;
	white-space: nowrap;
}

.nc-print-chrome-bar__overview-label {
	line-height: 1;
}

.nc-print-chrome-bar__overview--on {
	background: color-mix(in srgb, var(--nc-app-accent) 15%, transparent);
	border-color: var(--nc-app-accent);
	color: var(--nc-app-accent);
}
</style>
