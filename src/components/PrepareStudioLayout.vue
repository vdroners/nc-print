<script>
export default {
	name: 'PrepareStudioLayout',
	props: {
		/**
		 * 'studio'    — classic 3-column grid (left panels · viewport · right).
		 * 'immersive' — viewport fills the background; left/right panels float
		 *               over it as scrollable blurred cards (Creality/Orca feel).
		 * Reversible: immersive is purely additive CSS keyed off a modifier class.
		 */
		mode: {
			type: String,
			default: 'studio',
			validator: (v) => ['studio', 'immersive'].includes(v),
		},
	},
	computed: {
		immersive() {
			return this.mode === 'immersive'
		},
	},
}
</script>

<template>
	<div class="nc-print-prepare-studio" :class="{ 'nc-print-prepare-studio--immersive': immersive }">
		<aside class="nc-print-prepare-studio__left">
			<slot name="left" />
		</aside>
		<main class="nc-print-prepare-studio__center">
			<slot name="center" />
		</main>
		<aside class="nc-print-prepare-studio__right">
			<slot name="right" />
		</aside>
	</div>
</template>

<style scoped>
.nc-print-prepare-studio {
	display: grid;
	gap: var(--nc-gcs-space-md);
	grid-template-columns: minmax(220px, 280px) minmax(480px, 1fr) minmax(220px, 280px);
}

.nc-print-prepare-studio__right {
	display: flex;
	flex-direction: column;
	gap: var(--nc-gcs-space-md);
	min-width: 0;
}

/* ── Immersive: viewport fills the background, panels float over it ────────── */
.nc-print-prepare-studio--immersive {
	display: block;
	position: relative;
	/* Wide screens (min-width: 1201px below) give this a definite height equal
	   to the shell's free space. A full-viewport height ignored the Nextcloud
	   header, app banner, and footer, so the page scrolled the card ~100px. */
	flex: 1 1 auto;
	min-height: 0;
}

.nc-print-prepare-studio--immersive .nc-print-prepare-studio__center {
	position: absolute;
	inset: 0;
}

.nc-print-prepare-studio--immersive .nc-print-prepare-studio__left,
.nc-print-prepare-studio--immersive .nc-print-prepare-studio__right {
	position: absolute;
	top: var(--nc-gcs-space-md);
	bottom: var(--nc-gcs-space-md);
	width: var(--nc-print-side-left, 300px);
	max-width: 32vw;
	z-index: 6;
	display: flex;
	flex-direction: column;
	gap: var(--nc-gcs-space-md);
	/* Vertical scroll stays inside the card. overflow-x stays hidden so a
	   nowrap row (quality tiers) cannot grow a second, horizontal bar.
	   contain: a wheel at the end of the card does not move the page. */
	min-width: 0;
	overflow-x: hidden;
	overflow-y: auto;
	overscroll-behavior: contain;
	padding: var(--nc-gcs-space-md);
	border: 1px solid var(--nc-gcs-border);
	border-radius: var(--nc-gcs-radius-md, 12px);
	background: color-mix(in srgb, var(--nc-gcs-bg-surface, var(--color-main-background)) 82%, transparent);
	backdrop-filter: blur(8px);
	box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
}

.nc-print-prepare-studio--immersive .nc-print-prepare-studio__left {
	left: var(--nc-gcs-space-md);
}

.nc-print-prepare-studio--immersive .nc-print-prepare-studio__right {
	right: var(--nc-gcs-space-md);
	/* Thinner than the left card — readiness/summary is narrow. At ≥1920
	   Ultrawide, --nc-print-side-right rises to 300px via style.scss. */
	width: var(--nc-print-side-right, 260px);
}

/* ── Responsive: below the multi-column breakpoint, both modes collapse to a
   stacked column flow (floating overlays are unusable on narrow screens). ──── */
@media (max-width: 1200px) {
	.nc-print-prepare-studio {
		grid-template-columns: 1fr 1fr;
	}

	.nc-print-prepare-studio__center {
		grid-column: 1 / -1;
		order: -1;
	}

	/* Immersive → static column flow on narrow screens. */
	.nc-print-prepare-studio--immersive {
		display: grid;
		position: static;
		height: auto;
		max-height: none;
		min-height: 0;
		overflow: visible;
	}

	.nc-print-prepare-studio--immersive .nc-print-prepare-studio__center {
		position: static;
		inset: auto;
	}

	.nc-print-prepare-studio--immersive .nc-print-prepare-studio__left,
	.nc-print-prepare-studio--immersive .nc-print-prepare-studio__right {
		position: static;
		width: auto;
		max-width: none;
		inset: auto;
		overflow: visible;
		min-width: 0;
		background: transparent;
		backdrop-filter: none;
		box-shadow: none;
		border: none;
		padding: 0;
	}
}

@media (max-width: 900px) {
	.nc-print-prepare-studio {
		grid-template-columns: 1fr;
	}

	.nc-print-prepare-studio__center {
		grid-column: auto;
		order: -1;
	}
}

/* Wide screens: the studio IS the free space under the workflow bar.
   --nc-print-stage-h is measured from the shell (App.vue). 100% covers the
   first paint, before that measurement, when the tab-scroll has a height. */
@media (min-width: 1201px) {
	.nc-print-prepare-studio--immersive {
		/* Measured shell free space when App.vue has written it. 100% fills
		   the height:0 flex slot before that. max-height stops a long
		   measurement from growing the page scrollbar back. */
		height: var(--nc-print-stage-h, 100%);
		max-height: 100%;
		min-height: 0;
		overflow: hidden;
	}

	.nc-print-prepare-studio--immersive .nc-print-prepare-studio__left > :deep(*),
	.nc-print-prepare-studio--immersive .nc-print-prepare-studio__right > :deep(*) {
		max-width: 100%;
		min-width: 0;
	}
}
</style>
