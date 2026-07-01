<script>
import { cameraStreamUrl } from '@/services/moonraker-api.js'

export default {
	name: 'CameraPip',
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
	<div v-if="streamUrl" class="nc-print-camera-pip">
		<img :src="streamUrl" alt="Printer camera" loading="lazy">
	</div>
</template>
