<script>
export default {
	name: 'WorkspaceRail',
}
</script>

<template>
	<div class="nc-print-workspace">
		<div class="nc-print-workspace__main">
			<slot />
		</div>
		<!--
			Side column: sticky monitor (progress or last job, camera, E-STOP)
			plus whatever the rail slot still holds (job history). On a short
			window the side reflows above the main column, and the monitor
			itself stays sticky so the cluster does not scroll away.
		-->
		<div class="nc-print-workspace__side">
			<div class="nc-print-workspace__monitor">
				<slot name="monitor" />
			</div>
			<aside class="nc-print-workspace__rail" aria-label="Workspace preview">
				<slot name="rail" />
			</aside>
		</div>
	</div>
</template>

<style scoped>
.nc-print-workspace {
	display: grid;
	gap: var(--nc-gcs-space-md);
	grid-template-columns: minmax(0, 1fr) minmax(var(--nc-print-print-rail-min, 280px), 360px);
	align-items: start;
	min-height: 0;
}

/* Wide content: camera/monitor cluster is the visual hero; main controls densify. */
@media (min-width: 1600px) {
	.nc-print-workspace {
		grid-template-columns: minmax(0, 1.4fr) minmax(420px, 0.9fr);
	}
}

.nc-print-workspace__main {
	display: flex;
	flex-direction: column;
	gap: var(--nc-gcs-space-md);
	min-width: 0;
}

.nc-print-workspace__side {
	display: flex;
	flex-direction: column;
	gap: var(--nc-gcs-space-md);
	min-width: 0;
	max-width: 100%;
	align-self: start;
	position: sticky;
	/* Stick BELOW the chrome/workflow bar (sticky top:0 z-index:3). */
	top: var(--nc-print-chrome-h, 0px);
	max-height: calc(100vh - var(--nc-print-chrome-h, 0px) - 12px);
	max-height: calc(100dvh - var(--nc-print-chrome-h, 0px) - 12px);
	/* A long filename used to force a horizontal bar under the camera. */
	overflow-x: hidden;
	overflow-y: auto;
	z-index: 2;
}

.nc-print-workspace__monitor {
	display: flex;
	flex-direction: column;
	gap: var(--nc-gcs-space-md);
	max-width: 100%;
	min-width: 0;
	/* Stay put while job history scrolls inside the side column. */
	position: sticky;
	top: 0;
	z-index: 1;
	background: var(--color-main-background, var(--nc-gcs-bg, transparent));
}

.nc-print-workspace__rail {
	display: flex;
	flex-direction: column;
	gap: var(--nc-gcs-space-md);
	min-height: 0;
	min-width: 0;
}

@media (max-width: 1200px) {
	.nc-print-workspace {
		grid-template-columns: 1fr;
	}

	/* Let monitor + history become grid items so the monitor can stick
	   for the whole Print tab, not only while the short side column is
	   on screen. order: -1 keeps the rail reflow (cluster first). */
	.nc-print-workspace__side {
		display: contents;
		max-height: none;
		overflow: visible;
	}

	.nc-print-workspace__monitor {
		order: -1;
		position: sticky;
		top: var(--nc-print-chrome-h, 0px);
		z-index: 2;
		background: var(--color-main-background, var(--nc-gcs-bg, transparent));
		padding-bottom: var(--nc-gcs-space-sm, 8px);
	}

	.nc-print-workspace__rail {
		order: -1;
	}
}
</style>
