<script>
import { activateFocusTrap } from '@/composables/useFocusTrap.js'

export default {
	name: 'PreviewLightbox',
	props: {
		open: { type: Boolean, default: false },
		src: { type: String, default: '' },
		alt: { type: String, default: 'Slice preview' },
	},
	emits: ['close'],
	data() {
		return {
			focusTrap: null,
		}
	},
	methods: {
		onBackdrop(e) {
			if (e.target === e.currentTarget) {
				this.$emit('close')
			}
		},
		onKeydown(e) {
			if (e.key === 'Escape') {
				this.$emit('close')
			}
		},
		activateTrap() {
			this.$nextTick(() => {
				const el = this.$refs.dialog
				if (el) {
					this.focusTrap?.deactivate()
					this.focusTrap = activateFocusTrap(el)
				}
			})
		},
		deactivateTrap() {
			document.removeEventListener('keydown', this.onKeydown)
			document.body.style.overflow = ''
			this.focusTrap?.deactivate()
			this.focusTrap = null
		},
	},
	watch: {
		open(val) {
			if (val) {
				document.addEventListener('keydown', this.onKeydown)
				document.body.style.overflow = 'hidden'
				this.activateTrap()
			} else {
				this.deactivateTrap()
			}
		},
	},
	beforeUnmount() {
		this.deactivateTrap()
	},
}
</script>

<template>
	<teleport to="body">
		<div
			v-if="open && src"
			ref="dialog"
			class="nc-print-lightbox"
			role="dialog"
			aria-modal="true"
			:aria-label="alt"
			@click="onBackdrop">
			<button
				type="button"
				class="nc-print-lightbox__close"
				aria-label="Close preview"
				@click="$emit('close')">
				×
			</button>
			<img :src="src" :alt="alt" class="nc-print-lightbox__img">
		</div>
	</teleport>
</template>

<style scoped>
.nc-print-lightbox {
	align-items: center;
	background: rgba(0, 0, 0, 0.85);
	display: flex;
	inset: 0;
	justify-content: center;
	padding: var(--nc-gcs-space-lg);
	position: fixed;
	z-index: 10000;
}

.nc-print-lightbox__img {
	border-radius: var(--nc-gcs-radius-sm);
	max-height: 95vh;
	max-width: 95vw;
	object-fit: contain;
}

.nc-print-lightbox__close {
	appearance: none;
	background: rgba(0, 0, 0, 0.5);
	border: 1px solid rgba(255, 255, 255, 0.3);
	border-radius: 50%;
	color: #fff;
	cursor: pointer;
	font-size: 28px;
	height: 40px;
	line-height: 1;
	position: fixed;
	right: 24px;
	top: 24px;
	width: 40px;
	z-index: 10001;
}
</style>
