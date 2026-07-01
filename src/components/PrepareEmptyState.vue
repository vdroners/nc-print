<script>
export default {
	name: 'PrepareEmptyState',
}
</script>

<template>
	<div class="nc-print-prepare-empty">
		<div class="nc-print-prepare-empty__hero" aria-hidden="true">🖨️</div>
		<h2 class="nc-print-prepare-empty__title">Prepare your model</h2>
		<p class="nc-print-prepare-empty__lead">
			Import an STL, 3MF, or OBJ, choose printer profiles, then slice and send to Moonraker.
		</p>
		<div class="nc-print-prepare-empty__actions">
			<slot name="actions" />
		</div>
		<ol class="nc-print-prepare-empty__steps" aria-label="Workflow steps">
			<li><span>1</span> Import model</li>
			<li><span>2</span> Choose profiles</li>
			<li><span>3</span> Slice &amp; print</li>
		</ol>
	</div>
</template>

<style scoped>
.nc-print-prepare-empty {
	align-items: center;
	display: flex;
	flex-direction: column;
	gap: var(--nc-gcs-space-md);
	padding: var(--nc-gcs-space-lg) var(--nc-gcs-space-md);
	text-align: center;
}

.nc-print-prepare-empty__hero {
	font-size: 2.5rem;
	line-height: 1;
}

.nc-print-prepare-empty__title {
	font-size: var(--nc-gcs-text-base);
	font-weight: 600;
	margin: 0;
}

.nc-print-prepare-empty__lead {
	color: var(--nc-gcs-text-muted);
	font-size: var(--nc-gcs-text-sm);
	margin: 0;
	max-width: 36ch;
}

.nc-print-prepare-empty__actions {
	display: flex;
	flex-wrap: wrap;
	gap: var(--nc-gcs-space-sm);
	justify-content: center;
}

.nc-print-prepare-empty__steps {
	color: var(--nc-gcs-text-secondary);
	display: flex;
	flex-wrap: wrap;
	font-size: var(--nc-gcs-text-sm);
	gap: var(--nc-gcs-space-md);
	justify-content: center;
	list-style: none;
	margin: var(--nc-gcs-space-sm) 0 0;
	padding: 0;
}

.nc-print-prepare-empty__steps li {
	align-items: center;
	display: flex;
	gap: 6px;
}

.nc-print-prepare-empty__steps span {
	align-items: center;
	background: var(--nc-gcs-bg-elevated);
	border: 1px solid var(--nc-gcs-border);
	border-radius: 50%;
	display: inline-flex;
	font-size: 11px;
	font-weight: 600;
	height: 20px;
	justify-content: center;
	width: 20px;
}
</style>
