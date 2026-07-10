<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import NcPrintIcon from './NcPrintIcon.vue'

export default {
	name: 'MeshHealthPanel',
	components: { NcPrintIcon },
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
		statusBadgeClass() {
			if (!this.hasAnalysis) {
				return ''
			}
			if (this.health.watertight && this.health.overhangPct <= 30) {
				return 'nc-print-badge--ok'
			}
			if (!this.health.watertight) {
				return 'nc-print-badge--warn'
			}
			return 'nc-print-badge--info'
		},
		statusBadgeLabel() {
			if (!this.hasAnalysis) {
				return ''
			}
			if (this.health.watertight && this.health.overhangPct <= 30) {
				return 'Healthy'
			}
			if (!this.health.watertight) {
				return 'Needs repair'
			}
			return 'High overhang'
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
			return ''
		},
		printability() {
			return this.health.printability
		},
		bridgeCount() {
			return this.printability?.bridges?.count ?? null
		},
		orientationTip() {
			const sug = this.printability?.orientation_suggestions
			if (!Array.isArray(sug) || !sug.length) {
				return ''
			}
			const best = sug[0]
			const current = this.printability.overhang_fraction ?? 0
			// Only suggest a flip if it meaningfully beats the as-loaded overhang.
			if (best.orientation === 'as-loaded' || best.overhang_fraction + 0.05 >= current) {
				return ''
			}
			return `${best.orientation} → overhang ${Math.round(best.overhang_fraction * 100)}%`
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
		<div class="nc-print-card__header">
			<h2 class="nc-print-card__title">
				<span class="nc-print-card__title-row">
					<NcPrintIcon name="cube" :size="18" />
					Mesh health
				</span>
			</h2>
			<span v-if="statusBadgeLabel" class="nc-print-badge" :class="statusBadgeClass">
				{{ statusBadgeLabel }}
			</span>
		</div>
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
			<div v-if="bridgeCount != null">
				<dt>Bridges</dt>
				<dd>{{ bridgeCount }}</dd>
			</div>
		</dl>
		<p v-if="hasAnalysis && orientationTip" class="nc-print-mesh-health__tip">
			💡 {{ orientationTip }}
		</p>
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

.nc-print-mesh-health__tip {
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
