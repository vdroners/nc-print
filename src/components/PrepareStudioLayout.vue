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
	/* Fill the visible studio area below the sticky chrome. dvh handles mobile
	   browser chrome; the shell body still scrolls so overshoot is safe. */
	height: calc(100dvh - var(--nc-print-chrome-h, 0px) - 2 * var(--nc-gcs-space-lg, 16px));
	min-height: 520px;
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
	width: 300px;
	max-width: 32vw;
	z-index: 6;
	display: flex;
	flex-direction: column;
	gap: var(--nc-gcs-space-md);
	overflow-y: auto;
	overscroll-behavior: contain; /* don't chain wheel-scroll into the shell */
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
	/* Thinner than the left card — the readiness/summary content is narrow, and
	   this frees viewport width on the Prepare tab. */
	width: 260px;
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
		min-height: 0;
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
</style>
