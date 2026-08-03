<script>
export default {
	name: 'ErrorRecoveryCard',
	props: {
		kind: {
			type: String,
			required: true,
			validator: v => ['slicer_offline', 'moonraker_offline', 'slicer_setup', 'moonraker_setup', '3mf_fail', 'gcode_download_fail', 'generic'].includes(v),
		},
		detail: { type: String, default: '' },
	},
	computed: {
		title() {
			const map = {
				slicer_offline: 'Slicer offline',
				slicer_setup: 'Slicer not configured',
				moonraker_offline: 'Printer unreachable',
				moonraker_setup: 'Printer not configured',
				'3mf_fail': '3MF conversion failed',
				gcode_download_fail: 'G-code download failed',
				generic: 'Something went wrong',
			}
			return map[this.kind] || 'Error'
		},
		steps() {
			const map = {
				slicer_offline: [
					'Confirm the nc-print-slicer sidecar is running and reachable from this server.',
					'Check Admin → NC 3D Print → Slicer internal URL.',
					'Retry loading profiles after the service is healthy.',
				],
				slicer_setup: [
					'Open Admin → NC 3D Print and set the slicer internal URL.',
					'Deploy the nc-print-slicer container (see docs/INSTALL.md) if you want in-browser slicing.',
				],
				moonraker_setup: [
					'On Prepare, click Scan for printers and choose Use on your printer.',
					'Or open Admin → NC 3D Print to save a Moonraker URL permanently.',
				],
				moonraker_offline: [
					'Verify the printer is powered on and Moonraker responds on the LAN.',
					'Check Admin → Moonraker internal URL matches your printer.',
					'If using multi-printer config, confirm the selected printer URL.',
				],
				'3mf_fail': [
					'Export STL from Orca/Bambu Studio and import that instead.',
					'Ensure the 3MF contains a single printable mesh (not project-only).',
					'Try a smaller mesh or repair the model in your slicer.',
				],
				gcode_download_fail: [
					'The slice job finished but G-code could not be downloaded from the slicer.',
					'Click Retry download on the Slice tab.',
					'If the job expired, re-slice the model.',
				],
				generic: ['Review the message below and retry the last action.'],
			}
			return map[this.kind] || map.generic
		},
		bannerClass() {
			if (this.kind === 'gcode_download_fail' || this.kind === '3mf_fail') {
				return 'nc-print-error-recovery--warn'
			}
			return 'nc-print-error-recovery--danger'
		},
	},
	methods: {
		onDismiss() {
			this.$emit('dismiss')
		},
	},
}
</script>

<template>
	<div class="nc-print-error-recovery" :class="bannerClass" role="alert">
		<div class="nc-print-error-recovery__head">
			<strong>{{ title }}</strong>
			<button
				v-if="$listeners.dismiss"
				type="button"
				class="nc-print-link-btn nc-print-error-recovery__dismiss"
				aria-label="Dismiss"
				@click="onDismiss">
				×
			</button>
		</div>
		<p v-if="detail" class="nc-print-error-recovery__detail">{{ detail }}</p>
		<ol class="nc-print-error-recovery__steps">
			<li v-for="(step, i) in steps" :key="i">{{ step }}</li>
		</ol>
		<div v-if="$listeners.retry" class="nc-print-error-recovery__actions">
			<button type="button" class="nc-print-btn nc-print-btn--primary" @click="$emit('retry')">
				Retry
			</button>
		</div>
	</div>
</template>

<style scoped>
.nc-print-error-recovery {
	border-radius: var(--nc-gcs-radius-sm);
	font-size: var(--nc-gcs-text-sm);
	margin-bottom: var(--nc-gcs-space-md);
	padding: 10px 12px;
}

.nc-print-error-recovery--danger {
	background: color-mix(in srgb, var(--color-error) 18%, transparent);
	color: var(--color-error-text, var(--color-error));
}

.nc-print-error-recovery--warn {
	background: color-mix(in srgb, var(--color-warning) 18%, transparent);
	color: var(--nc-gcs-text-primary);
}

.nc-print-error-recovery__head {
	align-items: center;
	display: flex;
	gap: 8px;
	justify-content: space-between;
}

.nc-print-error-recovery__detail {
	margin: 6px 0 0;
	opacity: 0.9;
}

.nc-print-error-recovery__steps {
	margin: 8px 0 0;
	padding-left: 1.2rem;
}

.nc-print-error-recovery__steps li {
	margin: 4px 0;
}

.nc-print-error-recovery__actions {
	margin-top: 10px;
}

.nc-print-error-recovery__dismiss {
	font-size: 1.25rem;
	line-height: 1;
	padding: 0 4px;
	text-decoration: none;
}
</style>
