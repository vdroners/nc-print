<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { LINK_FLAP_BANNER_TEXT, linkFlapDetail } from '@/utils/link-flap.js'

/**
 * Non-blocking amber notice when Moonraker is flapping.
 * Dismiss hides this episode (page session only). The store also clears the
 * banner after the link stays online — see src/utils/link-flap.js.
 */
export default {
	name: 'LinkFlapBanner',
	computed: {
		...mapStores(usePrintStore),
		show() {
			return !!this.printStore.linkFlap?.visible
		},
		title() {
			return LINK_FLAP_BANNER_TEXT
		},
		detail() {
			return linkFlapDetail(this.printStore.linkFlap)
		},
	},
	methods: {
		dismiss() {
			this.printStore.dismissLinkFlap()
		},
	},
}
</script>

<template>
	<div
		v-if="show"
		class="nc-print-link-flap"
		role="status"
		aria-live="polite">
		<span class="nc-print-link-flap__dot" aria-hidden="true"></span>
		<div class="nc-print-link-flap__copy">
			<p class="nc-print-link-flap__title">{{ title }}</p>
			<p class="nc-print-link-flap__detail">{{ detail }}</p>
		</div>
		<button
			type="button"
			class="nc-print-link-flap__dismiss"
			@click="dismiss">
			Dismiss
		</button>
	</div>
</template>

<style scoped>
/* In-flow status row. It does not cover the app or disable controls. */
.nc-print-link-flap {
	align-items: center;
	background: color-mix(in srgb, var(--nc-gcs-warning, #eab308) 16%, transparent);
	border: 1px solid color-mix(in srgb, var(--nc-gcs-warning, #eab308) 48%, transparent);
	border-radius: 8px;
	color: var(--color-main-text);
	display: flex;
	flex-wrap: wrap;
	gap: 8px 12px;
	margin-top: var(--nc-gcs-space-sm);
	padding: 8px 12px;
}

.nc-print-link-flap__dot {
	background: var(--nc-gcs-warning, #eab308);
	border-radius: 50%;
	flex: 0 0 auto;
	height: 8px;
	width: 8px;
}

.nc-print-link-flap__copy {
	flex: 1 1 16rem;
	min-width: 0;
}

.nc-print-link-flap__title,
.nc-print-link-flap__detail {
	margin: 0;
}

.nc-print-link-flap__title {
	font-size: 0.84rem;
	font-weight: 600;
	line-height: 1.35;
}

.nc-print-link-flap__detail {
	color: var(--color-text-maxcontrast, #8b949e);
	font-size: 0.78rem;
	line-height: 1.35;
	margin-top: 2px;
}

.nc-print-link-flap__dismiss {
	appearance: none;
	background: none;
	border: none;
	color: inherit;
	cursor: pointer;
	flex: 0 0 auto;
	font: inherit;
	font-size: 0.78rem;
	padding: 4px 0;
	text-decoration: underline;
}

.nc-print-link-flap__dismiss:focus-visible {
	outline: 2px solid var(--nc-gcs-warning, #eab308);
	outline-offset: 2px;
}
</style>
