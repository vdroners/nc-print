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
		<aside class="nc-print-workspace__rail" aria-label="Workspace preview">
			<slot name="rail" />
		</aside>
	</div>
</template>

<style scoped>
.nc-print-workspace {
	display: grid;
	gap: var(--nc-gcs-space-md);
	grid-template-columns: minmax(0, 1fr) minmax(280px, 360px);
	min-height: 0;
}

.nc-print-workspace__main {
	display: flex;
	flex-direction: column;
	gap: var(--nc-gcs-space-md);
	min-width: 0;
}

.nc-print-workspace__rail {
	display: flex;
	flex-direction: column;
	gap: var(--nc-gcs-space-md);
	min-height: 0;
	min-width: 0;
	position: sticky;
	top: var(--nc-print-chrome-h, 0px);
}

@media (max-width: 1200px) {
	.nc-print-workspace {
		grid-template-columns: 1fr;
	}

	.nc-print-workspace__rail {
		order: -1;
		position: static;
	}
}
</style>
