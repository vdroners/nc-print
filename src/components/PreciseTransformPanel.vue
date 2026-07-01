<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'

const MM_PER_IN = 25.4

export default {
	name: 'PreciseTransformPanel',
	props: {
		disabled: { type: Boolean, default: false },
	},
	data() {
		return {
			unit: 'mm',
			scalePercent: 100,
			rotateX: 0,
			rotateY: 0,
			rotateZ: 0,
		}
	},
	computed: {
		...mapStores(usePrintStore),
	},
	watch: {
		'printStore.model.file'() {
			this.resetFields()
		},
	},
	methods: {
		resetFields() {
			this.scalePercent = 100
			this.rotateX = 0
			this.rotateY = 0
			this.rotateZ = 0
		},
		onApplyScale() {
			const pct = Number(this.scalePercent)
			if (!Number.isFinite(pct) || pct <= 0) {
				return
			}
			this.$emit('scale-percent', pct / 100)
		},
		onApplyRotate() {
			this.$emit('rotate-degrees', {
				x: Number(this.rotateX) || 0,
				y: Number(this.rotateY) || 0,
				z: Number(this.rotateZ) || 0,
			})
		},
		displayMm(value) {
			if (this.unit === 'inch') {
				return (value / MM_PER_IN).toFixed(2)
			}
			return Math.round(value)
		},
	},
}
</script>

<template>
	<div v-if="printStore.hasModel" class="nc-print-card nc-print-precise-transform">
		<h3 class="nc-print-card__title">Precise transform</h3>
		<div class="nc-print-precise-transform__row">
			<label>
				Unit
				<select v-model="unit" :disabled="disabled">
					<option value="mm">mm</option>
					<option value="inch">inch</option>
				</select>
			</label>
			<label>
				Scale %
				<input v-model.number="scalePercent" type="number" min="1" max="500" step="1" :disabled="disabled">
			</label>
			<button type="button" class="nc-print-btn" :disabled="disabled" @click="onApplyScale">
				Apply scale
			</button>
		</div>
		<div class="nc-print-precise-transform__row">
			<label>Rotate X° <input v-model.number="rotateX" type="number" step="1" :disabled="disabled"></label>
			<label>Rotate Y° <input v-model.number="rotateY" type="number" step="1" :disabled="disabled"></label>
			<label>Rotate Z° <input v-model.number="rotateZ" type="number" step="1" :disabled="disabled"></label>
			<button type="button" class="nc-print-btn" :disabled="disabled" @click="onApplyRotate">
				Apply rotation
			</button>
		</div>
		<p v-if="printStore.modelMeta.bbox" class="nc-print-precise-transform__hint">
			Bbox: {{ displayMm(printStore.modelMeta.bbox.x) }}×{{ displayMm(printStore.modelMeta.bbox.y) }}×{{ displayMm(printStore.modelMeta.bbox.z) }} {{ unit }}
		</p>
	</div>
</template>

<style scoped>
.nc-print-precise-transform__row {
	align-items: end;
	display: flex;
	flex-wrap: wrap;
	font-size: var(--nc-gcs-text-sm);
	gap: var(--nc-gcs-space-sm);
	margin-bottom: var(--nc-gcs-space-sm);
}

.nc-print-precise-transform__row label {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.nc-print-precise-transform__hint {
	color: var(--nc-gcs-text-muted);
	font-size: 11px;
	margin: 0;
}
</style>
