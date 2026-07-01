<script>
import { NcModal } from '@nextcloud/vue'

export default {
	name: 'HelpDrawer',
	components: { NcModal },
	props: {
		open: { type: Boolean, default: false },
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
			<h2 style="margin-top: 0;">NC Print — limitations</h2>
			<ul style="padding-left: 1.2em; line-height: 1.6; color: var(--nc-gcs-text-secondary);">
				<li>
					<strong>Slicer service required.</strong> Slice jobs need the OrcaSlicer REST
					service reachable via the NC Print backend proxy. Without it, profile load and
					slicing will fail.
				</li>
				<li>
					<strong>Moonraker for print control.</strong> Pause, resume, cancel, and
					upload-and-start require a configured Moonraker instance. Status polling is
					best-effort when offline.
				</li>
				<li>
					<strong>Model viewport is a placeholder.</strong> The Prepare tab shows a
					canvas bed grid preview, not a full STL mesh viewer. Use the slice preview PNG
					for layer visualization.
				</li>
				<li>
					<strong>Supported formats:</strong> STL and 3MF for slicing; OBJ import is
					accepted in Prepare but may be rejected by the slicer depending on profile.
				</li>
				<li>
					<strong>Single active slice job.</strong> Starting a new slice cancels any
					in-progress stream. Concurrent jobs are not supported in v1.0.0.
				</li>
				<li>
					<strong>Camera stream.</strong> MJPEG or snapshot URLs must be configured in
					app settings; mixed-content (HTTP camera on HTTPS Nextcloud) may be blocked by
					the browser.
				</li>
			</ul>
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
</style>
