<script>
/**
 * Overlay for a webcam snapshot that has stopped updating.
 * The words "Camera stale" stay stable for assistive tech; the age is visual.
 */
export default {
	name: 'CameraStaleBadge',
	props: {
		stale: { type: Boolean, default: false },
		ageLabel: { type: String, default: '' },
	},
}
</script>

<template>
	<p
		v-if="stale"
		class="nc-print-camera-stale"
		role="status"
		data-camera-stale
		title="The webcam snapshot has stopped updating. This frame is not live.">
		<span class="nc-print-camera-stale__label">Camera stale</span>
		<span v-if="ageLabel" class="nc-print-camera-stale__age" aria-hidden="true">{{ ageLabel }}</span>
	</p>
</template>
