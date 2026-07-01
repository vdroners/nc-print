<script>
import { NcModal } from '@nextcloud/vue'

export default {
	name: 'HelpDrawer',
	components: { NcModal },
	props: {
		open: { type: Boolean, default: false },
	},
	data() {
		return {
			tab: 'workflow',
		}
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
					See <code>docs/OPERATOR.md</code>, <code>docs/TROUBLESHOOTING.md</code>, and <code>docs/ADMIN.md</code> in the app repository.
				</p>
			</div>

			<div v-else role="tabpanel">
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
</style>
