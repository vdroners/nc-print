<script>
export default {
	name: 'PrepareStudioLayout',
}
</script>

<template>
	<div class="nc-print-prepare-studio">
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
	grid-template-columns: minmax(220px, 280px) minmax(480px, 1fr) minmax(200px, 260px);
}

@media (max-width: 1199px) {
	.nc-print-prepare-studio {
		grid-template-columns: 1fr 1fr;
	}

	.nc-print-prepare-studio__center {
		grid-column: 1 / -1;
		order: -1;
	}
}

@media (max-width: 899px) {
	.nc-print-prepare-studio {
		grid-template-columns: 1fr;
	}

	.nc-print-prepare-studio__center {
		grid-column: auto;
		order: -1;
	}
}
</style>
