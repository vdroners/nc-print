<script>
import { cameraStreamUrl } from '@/services/moonraker-api.js'
import { useCameraFrame } from '@/composables/useCameraFrame.js'

export default {
	name: 'CameraPip',
	mixins: [useCameraFrame('streamUrl')],
	props: {
		config: { type: Object, default: null },
	},
	computed: {
		streamUrl() {
			return cameraStreamUrl(this.config)
		},
	},
}
</script>

<template>
	<div v-if="streamUrl && cameraFrameUrl && !cameraError" class="nc-print-camera-pip">
		<img :src="cameraFrameUrl" alt="Printer camera" loading="lazy" @error="onCameraError">
	</div>
</template>
