<script>
import { NcModal } from '@nextcloud/vue'
import SlicerStatusCard from './SlicerStatusCard.vue'
import { TABS } from '@/constants/tabs.js'

const CALIBRATION_LINKS = [
	{
		title: 'Flow rate (extrusion multiplier)',
		href: 'https://wiki.orcaslicer.com/en/troubleshooting/flow-rate-calibration',
		note: 'Dial in extrusion when walls are over- or under-filled.',
	},
	{
		title: 'Pressure advance / Linear advance',
		href: 'https://wiki.orcaslicer.com/en/troubleshooting/pressure-advance-calibration',
		note: 'Reduce corner blobs and improve sharp corners on direct-drive and Bowden setups.',
	},
	{
		title: 'Retraction tuning',
		href: 'https://wiki.orcaslicer.com/en/troubleshooting/retraction-calibration',
		note: 'Minimize stringing without clogging the hot end.',
	},
	{
		title: '0.2 mm tolerance test',
		href: 'https://wiki.orcaslicer.com/en/troubleshooting/0.2mm-tolerance-test',
		note: 'Quick dimensional sanity check for XY accuracy.',
	},
	{
		title: 'Temperature tower',
		href: 'https://wiki.orcaslicer.com/en/troubleshooting/temperature-tower',
		note: 'Find the best nozzle temp for a new filament roll.',
	},
	{
		title: 'OrcaSlicer wiki home',
		href: 'https://wiki.orcaslicer.com/',
		note: 'Full desktop slicer docs — run calibrations in OrcaSlicer, then save profiles for NC Print.',
	},
]

export default {
	name: 'HelpDrawer',
	components: { NcModal, SlicerStatusCard },
	props: {
		open: { type: Boolean, default: false },
		workflowTab: { type: String, default: 'workflow' },
	},
	data() {
		return {
			tab: 'workflow',
			calibrationLinks: CALIBRATION_LINKS,
		}
	},
	watch: {
		open(isOpen) {
			if (isOpen) {
				this.tab = this.initialTab
			}
		},
	},
	computed: {
		initialTab() {
			if (this.workflowTab === TABS.SLICE) {
				return 'calibration'
			}
			if (this.workflowTab === TABS.PRINT) {
				return 'limits'
			}
			return 'workflow'
		},
	},
	methods: {
		close() {
			this.$emit('update:open', false)
		},
	},
}
</script>

<template>
	<NcModal
		v-if="open"
		size="normal"
		:name="'nc-print-help'"
		@close="close">
		<div class="nc-print-help">
			<div class="nc-print-help-tabs" role="tablist">
				<button
					type="button"
					role="tab"
					class="nc-print-help-tabs__btn"
					:class="{ 'nc-print-help-tabs__btn--active': tab === 'workflow' }"
					@click="tab = 'workflow'">
					Workflow
				</button>
				<button
					type="button"
					role="tab"
					class="nc-print-help-tabs__btn"
					:class="{ 'nc-print-help-tabs__btn--active': tab === 'calibration' }"
					@click="tab = 'calibration'">
					Calibration
				</button>
				<button
					type="button"
					role="tab"
					class="nc-print-help-tabs__btn"
					:class="{ 'nc-print-help-tabs__btn--active': tab === 'services' }"
					@click="tab = 'services'">
					Services
				</button>
				<button
					type="button"
					role="tab"
					class="nc-print-help-tabs__btn"
					:class="{ 'nc-print-help-tabs__btn--active': tab === 'limits' }"
					@click="tab = 'limits'">
					Limitations
				</button>
			</div>

			<div v-if="tab === 'workflow'" role="tabpanel">
				<h2 style="margin-top: 0;">Prepare → Slice → Print</h2>
				<ol style="padding-left: 1.2em; line-height: 1.6; color: var(--nc-gcs-text-secondary);">
					<li><strong>Prepare</strong> — import or pick a model, choose printer/filament/process profiles, preview on the bed.</li>
					<li><strong>Slice</strong> — adjust advanced overrides if needed, slice, review result stats and preview PNG.</li>
					<li><strong>Print</strong> — send G-code, monitor progress, pause/resume/cancel, watch the camera.</li>
				</ol>
				<p style="font-size: var(--nc-gcs-text-sm); color: var(--nc-gcs-text-muted);">
					Open STL/3MF/OBJ or G-code from the Files app via <strong>Open in NC 3D Print</strong>.
					See <code>docs/OPERATOR.md</code>, <code>docs/TROUBLESHOOTING.md</code>, and <code>docs/ADMIN.md</code>.
				</p>
			</div>

			<div v-else-if="tab === 'calibration'" role="tabpanel">
				<h2 style="margin-top: 0;">OrcaSlicer calibration guides</h2>
				<p style="font-size: var(--nc-gcs-text-sm); color: var(--nc-gcs-text-muted); margin-top: 0;">
					NC Print slices with forge-slicer (Orca engine). Run these calibrations in desktop OrcaSlicer,
					then export or sync profiles to the forge-slicer config directory (Help → Services).
				</p>
				<ul class="nc-print-help-cal-list">
					<li v-for="link in calibrationLinks" :key="link.href">
						<a :href="link.href" target="_blank" rel="noopener noreferrer">{{ link.title }}</a>
						<span>{{ link.note }}</span>
					</li>
				</ul>
			</div>

			<div v-else-if="tab === 'services'" role="tabpanel">
				<h2 style="margin-top: 0;">Forge slicer & printer</h2>
				<SlicerStatusCard />
				<p style="font-size: var(--nc-gcs-text-sm); color: var(--nc-gcs-text-muted);">
					When services are offline, see <code>docs/TROUBLESHOOTING.md</code> and Admin settings.
				</p>
			</div>

			<div v-else-if="tab === 'limits'" role="tabpanel">
				<h2 style="margin-top: 0;">NC 3D Print — limitations</h2>
				<ul style="padding-left: 1.2em; line-height: 1.6; color: var(--nc-gcs-text-secondary);">
					<li>
						<strong>Slicer service required.</strong> Slice jobs need the OrcaSlicer REST
						service reachable via the NC Print backend proxy.
					</li>
					<li>
						<strong>Moonraker for print control.</strong> Pause, resume, cancel, and
						upload-and-start require a configured Moonraker instance.
					</li>
					<li>
						<strong>Viewport preview.</strong> STL meshes render in Three.js; 3MF/OBJ slice on the server without mesh preview.
					</li>
					<li>
						<strong>Single active slice job.</strong> Starting a new slice cancels any in-progress stream.
					</li>
					<li>
						<strong>Camera stream.</strong> MJPEG or snapshot URLs must be configured in app settings.
					</li>
					<li>
						<strong>Calibration wizards.</strong> Orca desktop calibration flows are not embedded — use the Calibration tab links.
					</li>
				</ul>
			</div>

			<div class="nc-print-actions">
				<button type="button" class="nc-print-btn nc-print-btn--primary" @click="close">
					Got it
				</button>
			</div>
		</div>
	</NcModal>
</template>

<style scoped>
.nc-print-help {
	padding: var(--nc-gcs-space-md);
}

.nc-print-help-tabs {
	display: flex;
	flex-wrap: wrap;
	gap: var(--nc-gcs-space-sm);
	margin-bottom: var(--nc-gcs-space-md);
}

.nc-print-help-tabs__btn {
	appearance: none;
	background: var(--nc-gcs-bg-elevated);
	border: 1px solid var(--nc-gcs-border);
	border-radius: var(--nc-gcs-radius-sm);
	cursor: pointer;
	font-family: inherit;
	padding: 6px 12px;
}

.nc-print-help-tabs__btn--active {
	border-color: var(--nc-app-accent);
	color: var(--nc-app-accent);
}

.nc-print-help-cal-list {
	list-style: none;
	margin: 0;
	padding: 0;
}

.nc-print-help-cal-list li {
	border-bottom: 1px solid var(--nc-gcs-border);
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 0;
}

.nc-print-help-cal-list a {
	color: var(--nc-app-accent);
	font-weight: 600;
	text-decoration: none;
}

.nc-print-help-cal-list a:hover {
	text-decoration: underline;
}

.nc-print-help-cal-list span {
	color: var(--nc-gcs-text-muted);
	font-size: var(--nc-gcs-text-sm);
}
</style>
