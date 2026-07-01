<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'

export default {
	name: 'MeshHealthPanel',
	props: {
		disabled: { type: Boolean, default: false },
	},
	computed: {
		...mapStores(usePrintStore),
		health() {
			return this.printStore.meshHealth
		},
		hasAnalysis() {
			return this.health.analyzed
		},
		statusClass() {
			if (!this.hasAnalysis) {
				return ''
			}
			if (this.health.watertight && this.health.overhangPct <= 30) {
				return 'nc-print-mesh-health--ok'
			}
			if (!this.health.watertight) {
				return 'nc-print-mesh-health--warn'
			}
			return 'nc-print-mesh-health--info'
		},
	},
	methods: {
		onAnalyze() {
			this.$emit('analyze')
		},
		onRepair() {
			this.$emit('repair')
		},
		onAutoOrient() {
			this.$emit('auto-orient')
		},
	},
}
</script>

<template>
	<div v-if="printStore.hasModel" class="nc-print-card nc-print-mesh-health" :class="statusClass">
		<h2 class="nc-print-card__title">Mesh health</h2>
		<p v-if="!hasAnalysis" class="nc-print-mesh-health__hint">
			Analyze the loaded mesh for open edges and overhang before slicing.
		</p>
		<dl v-else class="nc-print-mesh-health__stats">
			<div>
				<dt>Triangles</dt>
				<dd>{{ health.triangleCount.toLocaleString() }}</dd>
			</div>
			<div v-if="health.bbox">
				<dt>Bbox (mm)</dt>
				<dd>{{ Math.round(health.bbox.x) }}×{{ Math.round(health.bbox.y) }}×{{ Math.round(health.bbox.z) }}</dd>
			</div>
			<div>
				<dt>Open edges</dt>
				<dd>{{ health.openEdgeCount }}</dd>
			</div>
			<div>
				<dt>Overhang</dt>
				<dd>{{ health.overhangPct }}%</dd>
			</div>
			<div>
				<dt>Watertight</dt>
				<dd>{{ health.watertight ? 'Yes' : 'No' }}</dd>
			</div>
		</dl>
		<div class="nc-print-mesh-health__actions">
			<button
				type="button"
				class="nc-print-btn"
				:disabled="disabled"
				@click="onAnalyze">
				Analyze
			</button>
			<button
				type="button"
				class="nc-print-btn"
				:disabled="disabled || !hasAnalysis"
				@click="onRepair">
				Repair
			</button>
			<button
				type="button"
				class="nc-print-btn"
				:disabled="disabled"
				@click="onAutoOrient">
				Auto-orient
			</button>
		</div>
	</div>
</template>

<style scoped>
.nc-print-mesh-health__hint {
	color: var(--nc-gcs-text-muted);
	font-size: var(--nc-gcs-text-sm);
	margin: 0 0 var(--nc-gcs-space-sm);
}

.nc-print-mesh-health__stats {
	display: grid;
	font-size: var(--nc-gcs-text-sm);
	gap: 8px 16px;
	grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
	margin: 0 0 var(--nc-gcs-space-sm);
}

.nc-print-mesh-health__stats dt {
	color: var(--nc-gcs-text-muted);
	font-size: 11px;
	margin: 0;
	text-transform: uppercase;
}

.nc-print-mesh-health__stats dd {
	font-weight: 600;
	margin: 2px 0 0;
}

.nc-print-mesh-health__actions {
	display: flex;
	flex-wrap: wrap;
	gap: var(--nc-gcs-space-sm);
}

.nc-print-mesh-health--ok {
	border-color: color-mix(in srgb, var(--nc-app-accent) 40%, var(--nc-gcs-border));
}

.nc-print-mesh-health--warn {
	border-color: color-mix(in srgb, var(--nc-gcs-danger) 35%, var(--nc-gcs-border));
}
</style>
