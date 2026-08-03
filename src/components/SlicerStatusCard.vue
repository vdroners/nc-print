<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'

export default {
	name: 'SlicerStatusCard',
	computed: {
		...mapStores(usePrintStore),
		s() {
			return this.printStore.appStatus
		},
		show() {
			return this.s.loaded && this.s.slicer_enabled
		},
		statusLabel() {
			return this.s.slicer_ok ? 'Online' : 'Offline'
		},
		statusClass() {
			return this.s.slicer_ok ? 'nc-print-slicer-status--ok' : 'nc-print-slicer-status--warn'
		},
	},
}
</script>

<template>
	<div v-if="show" class="nc-print-card nc-print-slicer-status" :class="statusClass">
		<h2 class="nc-print-card__title">Forge slicer</h2>
		<dl class="nc-print-slicer-status__list">
			<div>
				<dt>Status</dt>
				<dd>{{ statusLabel }}</dd>
			</div>
			<div v-if="s.slicer_version">
				<dt>Version</dt>
				<dd>{{ s.slicer_version }}</dd>
			</div>
			<div v-if="s.slicer_upstream">
				<dt>Engine</dt>
				<dd>{{ s.slicer_upstream }}</dd>
			</div>
			<div v-if="s.slicer_config_dir">
				<dt>Profiles</dt>
				<dd class="nc-print-slicer-status__path">{{ s.slicer_config_dir }}</dd>
			</div>
			<div v-if="s.slicer_latency_ms != null">
				<dt>Latency</dt>
				<dd>{{ s.slicer_latency_ms }} ms</dd>
			</div>
		</dl>
		<p v-if="!s.slicer_ok && s.slicer_error" class="nc-print-slicer-status__error">
			{{ s.slicer_error }}
		</p>
	</div>
</template>

<style scoped>
.nc-print-slicer-status__list {
	display: grid;
	gap: 6px;
	margin: 0;
}

.nc-print-slicer-status__list div {
	display: flex;
	font-size: var(--nc-gcs-text-sm);
	gap: 8px;
}

.nc-print-slicer-status__list dt {
	color: var(--nc-gcs-text-muted);
	min-width: 72px;
}

.nc-print-slicer-status__list dd {
	margin: 0;
}

.nc-print-slicer-status__path {
	font-family: var(--nc-gcs-font-mono, monospace);
	font-size: var(--nc-gcs-text-xs);
	word-break: break-all;
}

.nc-print-slicer-status__error {
	color: var(--color-error-text, var(--color-error));
	font-size: var(--nc-gcs-text-sm);
	margin: var(--nc-gcs-space-sm) 0 0;
}

.nc-print-slicer-status--ok {
	border-color: color-mix(in srgb, var(--nc-app-accent) 35%, var(--nc-gcs-border));
}

.nc-print-slicer-status--warn {
	border-color: color-mix(in srgb, var(--color-warning) 40%, var(--nc-gcs-border));
}
</style>
