<script>
/**
 * Persistent camera-view cluster docked in a viewport corner — the standard
 * slicer nav affordance (Top/Front/Right/Iso/Fit). Emits `@camera` with the
 * preset name; the parent proxies to viewport.setCameraPreset (which already
 * exists end-to-end). Always visible, unlike the preset buttons that were buried
 * inside the transient 'view' tool panel.
 */
export default {
	name: 'ViewportCameraCube',
	data() {
		return {
			views: [
				{ id: 'iso', label: 'Iso' },
				{ id: 'top', label: 'Top' },
				{ id: 'front', label: 'Front' },
				{ id: 'right', label: 'Right' },
				{ id: 'fit', label: 'Fit' },
			],
		}
	},
}
</script>

<template>
	<div class="nc-print-camcube" role="group" aria-label="Camera views">
		<button
			v-for="v in views"
			:key="v.id"
			type="button"
			class="nc-print-camcube__btn"
			:title="`${v.label} view`"
			@click="$emit('camera', v.id)">
			{{ v.label }}
		</button>
	</div>
</template>

<style scoped>
.nc-print-camcube {
	display: flex;
	flex-direction: column;
	gap: 3px;
	padding: 4px;
	border: 1px solid var(--nc-gcs-border);
	border-radius: var(--nc-gcs-radius-md, 12px);
	background: color-mix(in srgb, var(--nc-gcs-bg-surface, var(--color-main-background)) 82%, transparent);
	backdrop-filter: blur(8px);
	box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}
.nc-print-camcube__btn {
	appearance: none;
	background: transparent;
	border: 1px solid transparent;
	border-radius: var(--nc-gcs-radius-sm);
	color: var(--nc-gcs-text-primary);
	cursor: pointer;
	font-size: 11px;
	min-width: 44px;
	padding: 4px 8px;
	text-align: center;
}
.nc-print-camcube__btn:hover {
	background: var(--nc-gcs-bg-hover, rgba(255, 255, 255, 0.08));
	border-color: var(--nc-app-accent);
}
</style>
