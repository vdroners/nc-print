<script>
import {
	fetchSpools,
	createSpool,
	updateSpool,
	deleteSpool,
} from '@/services/filament-inventory-api.js'

/**
 * Filament/spool inventory — a standalone pillar (v1). Reads the DB-backed spool
 * list for the current user, shows a summary + per-spool cards with a remaining
 * bar and low-stock badge, and offers add/edit/delete. All rows are scoped
 * server-side to the session user; failures are surfaced inline, not thrown.
 */
export default {
	name: 'FilamentInventoryPanel',
	data() {
		return {
			spools: [],
			summary: { count: 0, total_remaining_g: 0, total_cost: 0, low_stock: 0 },
			loading: false,
			loadError: '',
			saving: false,
			editingId: null,
			form: this.blankForm(),
		}
	},
	computed: {
		totalRemainingKg() {
			return (Number(this.summary.total_remaining_g || 0) / 1000).toFixed(2)
		},
	},
	async mounted() {
		await this.reload()
	},
	methods: {
		blankForm() {
			return {
				brand: '',
				material: '',
				color_hex: '#4c8eda',
				weight_total_g: 1000,
				cost: '',
				location: '',
			}
		},
		async reload() {
			this.loading = true
			this.loadError = ''
			try {
				const data = await fetchSpools(false)
				this.spools = data.spools || []
				this.summary = data.summary || this.summary
			} catch (e) {
				this.loadError = e?.message || 'Could not load filament inventory'
			} finally {
				this.loading = false
			}
		},
		async submit() {
			if (this.saving) {
				return
			}
			const brand = (this.form.brand || '').trim()
			const material = (this.form.material || '').trim()
			if (!brand && !material) {
				this.loadError = 'Enter a brand or material.'
				return
			}
			this.saving = true
			this.loadError = ''
			const payload = {
				brand,
				material,
				color_hex: this.form.color_hex || '',
				weight_total_g: Number(this.form.weight_total_g) || 1000,
				cost: this.form.cost === '' ? '' : Number(this.form.cost),
				location: (this.form.location || '').trim(),
			}
			try {
				if (this.editingId) {
					await updateSpool(this.editingId, payload)
				} else {
					await createSpool(payload)
				}
				this.resetForm()
				await this.reload()
			} catch (e) {
				this.loadError = e?.message || 'Could not save spool'
			} finally {
				this.saving = false
			}
		},
		startEdit(spool) {
			this.editingId = spool.id
			this.form = {
				brand: spool.brand || '',
				material: spool.material || '',
				color_hex: spool.color_hex || '#4c8eda',
				weight_total_g: spool.weight_total_g || 1000,
				cost: spool.cost == null ? '' : spool.cost,
				location: spool.location || '',
			}
		},
		resetForm() {
			this.editingId = null
			this.form = this.blankForm()
		},
		async remove(id) {
			// eslint-disable-next-line no-alert
			if (!window.confirm('Delete this spool?')) {
				return
			}
			try {
				await deleteSpool(id)
				if (this.editingId === id) {
					this.resetForm()
				}
				await this.reload()
			} catch (e) {
				this.loadError = e?.message || 'Could not delete spool'
			}
		},
		spoolTitle(spool) {
			return [spool.brand, spool.material].filter(Boolean).join(' · ') || 'Spool'
		},
		money(spool) {
			if (spool.cost == null) {
				return ''
			}
			const cur = spool.currency ? spool.currency + ' ' : ''
			return `${cur}${Number(spool.cost).toFixed(2)}`
		},
	},
}
</script>

<template>
	<div class="nc-print-card nc-print-fil">
		<h2 class="nc-print-card__title">Filament inventory</h2>

		<div class="nc-print-fil__summary">
			<div class="nc-print-fil__metric">
				<span class="nc-print-fil__metric-val">{{ summary.count }}</span>
				<span class="nc-print-fil__metric-lbl">Spools</span>
			</div>
			<div class="nc-print-fil__metric">
				<span class="nc-print-fil__metric-val">{{ totalRemainingKg }}kg</span>
				<span class="nc-print-fil__metric-lbl">Remaining</span>
			</div>
			<div class="nc-print-fil__metric">
				<span class="nc-print-fil__metric-val" :class="{ 'is-low': summary.low_stock > 0 }">
					{{ summary.low_stock }}
				</span>
				<span class="nc-print-fil__metric-lbl">Low stock</span>
			</div>
		</div>

		<p v-if="loadError" class="nc-print-fil__error">{{ loadError }}</p>

		<!-- Spool list -->
		<p v-if="loading && !spools.length" class="nc-print-fil__empty">Loading inventory…</p>
		<p v-else-if="!spools.length" class="nc-print-fil__empty">
			No spools yet. Add your first spool below.
		</p>
		<div v-else class="nc-print-fil__grid">
			<div v-for="spool in spools" :key="spool.id" class="nc-print-fil__spool">
				<span
					class="nc-print-fil__swatch"
					:style="{ background: spool.color_hex || 'transparent' }"
					aria-hidden="true" />
				<div class="nc-print-fil__body">
					<div class="nc-print-fil__head">
						<span class="nc-print-fil__name" :title="spoolTitle(spool)">{{ spoolTitle(spool) }}</span>
						<span v-if="spool.low_stock" class="nc-print-fil__badge">Low</span>
					</div>
					<div class="nc-print-fil__bar" role="img"
						:aria-label="`${spool.remaining_pct} percent remaining`">
						<div class="nc-print-fil__bar-fill"
							:class="{ 'is-low': spool.low_stock }"
							:style="{ width: spool.remaining_pct + '%' }" />
					</div>
					<div class="nc-print-fil__meta">
						<span>{{ spool.remaining_pct }}% · {{ Math.round(spool.weight_remaining_g) }}g</span>
						<span v-if="money(spool)">{{ money(spool) }}</span>
						<span v-if="spool.location">{{ spool.location }}</span>
					</div>
					<div class="nc-print-fil__actions">
						<button type="button" class="nc-print-btn nc-print-btn--sm" @click="startEdit(spool)">
							Edit
						</button>
						<button
							type="button"
							class="nc-print-btn nc-print-btn--sm nc-print-fil__danger"
							@click="remove(spool.id)">
							Delete
						</button>
					</div>
				</div>
			</div>
		</div>

		<!-- Add / edit form -->
		<form class="nc-print-fil__form" @submit.prevent="submit">
			<p class="nc-print-section-label">{{ editingId ? 'Edit spool' : 'Add spool' }}</p>
			<div class="nc-print-fil__fields">
				<label class="nc-print-fil__field">
					<span class="nc-print-fil__field-lbl">Brand</span>
					<input v-model.trim="form.brand" type="text" class="nc-print-input"
						maxlength="128" placeholder="e.g. Polymaker">
				</label>
				<label class="nc-print-fil__field">
					<span class="nc-print-fil__field-lbl">Material</span>
					<input v-model.trim="form.material" type="text" class="nc-print-input"
						maxlength="64" placeholder="e.g. PLA">
				</label>
				<label class="nc-print-fil__field nc-print-fil__field--color">
					<span class="nc-print-fil__field-lbl">Color</span>
					<input v-model="form.color_hex" type="color" class="nc-print-fil__color">
				</label>
				<label class="nc-print-fil__field">
					<span class="nc-print-fil__field-lbl">Total (g)</span>
					<input v-model.number="form.weight_total_g" type="number" min="0" step="1"
						class="nc-print-input" placeholder="1000">
				</label>
				<label class="nc-print-fil__field">
					<span class="nc-print-fil__field-lbl">Cost</span>
					<input v-model="form.cost" type="number" min="0" step="0.01"
						class="nc-print-input" placeholder="0.00">
				</label>
				<label class="nc-print-fil__field">
					<span class="nc-print-fil__field-lbl">Location</span>
					<input v-model.trim="form.location" type="text" class="nc-print-input"
						maxlength="128" placeholder="e.g. Dry box A">
				</label>
			</div>
			<div class="nc-print-fil__form-actions">
				<button type="submit" class="nc-print-btn nc-print-btn--sm" :disabled="saving">
					{{ editingId ? 'Save changes' : 'Add spool' }}
				</button>
				<button v-if="editingId" type="button" class="nc-print-btn nc-print-btn--sm"
					:disabled="saving" @click="resetForm">
					Cancel
				</button>
			</div>
		</form>
	</div>
</template>

<style scoped>
.nc-print-fil {
	display: flex;
	flex-direction: column;
	gap: var(--nc-gcs-space-md, 12px);
}

.nc-print-fil__summary {
	display: grid;
	gap: var(--nc-gcs-space-sm, 8px);
	grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
}

.nc-print-fil__metric {
	background: var(--nc-gcs-surface-2, var(--color-background-hover));
	border-radius: var(--nc-gcs-radius, 8px);
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 8px;
	text-align: center;
}

.nc-print-fil__metric-val {
	font-size: var(--nc-gcs-text-lg, 1.1rem);
	font-weight: 600;
}

.nc-print-fil__metric-val.is-low {
	color: var(--color-error, #c33);
}

.nc-print-fil__metric-lbl {
	color: var(--nc-gcs-text-muted);
	font-size: 12px;
}

.nc-print-fil__error {
	color: var(--color-error, #c33);
	font-size: var(--nc-gcs-text-sm);
	margin: 0;
}

.nc-print-fil__empty {
	color: var(--nc-gcs-text-muted);
	font-size: var(--nc-gcs-text-sm);
	margin: 0;
}

.nc-print-fil__grid {
	display: grid;
	gap: var(--nc-gcs-space-sm, 8px);
	grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
}

.nc-print-fil__spool {
	align-items: stretch;
	background: var(--nc-gcs-surface-2, var(--color-background-hover));
	border: 1px solid var(--nc-gcs-border, var(--color-border));
	border-radius: var(--nc-gcs-radius, 8px);
	display: flex;
	gap: var(--nc-gcs-space-sm, 8px);
	overflow: hidden;
	padding: 8px;
}

.nc-print-fil__swatch {
	border: 1px solid var(--nc-gcs-border, var(--color-border));
	border-radius: 4px;
	flex: 0 0 24px;
	width: 24px;
}

.nc-print-fil__body {
	display: flex;
	flex: 1;
	flex-direction: column;
	gap: 6px;
	min-width: 0;
}

.nc-print-fil__head {
	align-items: center;
	display: flex;
	gap: 6px;
	justify-content: space-between;
}

.nc-print-fil__name {
	font-weight: 600;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.nc-print-fil__badge {
	background: var(--color-error, #c33);
	border-radius: 999px;
	color: #fff;
	flex: 0 0 auto;
	font-size: 11px;
	padding: 1px 8px;
}

.nc-print-fil__bar {
	background: var(--color-background-dark, #ddd);
	border-radius: 4px;
	height: 8px;
	overflow: hidden;
}

.nc-print-fil__bar-fill {
	background: var(--color-success, #2b2);
	height: 100%;
}

.nc-print-fil__bar-fill.is-low {
	background: var(--color-error, #c33);
}

.nc-print-fil__meta {
	color: var(--nc-gcs-text-muted);
	display: flex;
	flex-wrap: wrap;
	font-size: 12px;
	gap: 8px;
}

.nc-print-fil__actions {
	display: flex;
	gap: var(--nc-gcs-space-sm, 8px);
	margin-top: auto;
}

.nc-print-fil__danger {
	color: var(--color-error, #c33);
}

.nc-print-fil__form {
	border-top: 1px solid var(--nc-gcs-border, var(--color-border));
	padding-top: var(--nc-gcs-space-md, 12px);
}

.nc-print-fil__fields {
	display: grid;
	gap: var(--nc-gcs-space-sm, 8px);
	grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
	margin-bottom: var(--nc-gcs-space-sm, 8px);
}

.nc-print-fil__field {
	display: flex;
	flex-direction: column;
	font-size: 12px;
	gap: 2px;
}

.nc-print-fil__field--color {
	flex: 0 0 auto;
}

.nc-print-fil__field-lbl {
	color: var(--nc-gcs-text-muted);
}

.nc-print-fil__color {
	background: none;
	border: 1px solid var(--nc-gcs-border, var(--color-border));
	border-radius: 4px;
	cursor: pointer;
	height: 32px;
	padding: 2px;
	width: 100%;
}

.nc-print-fil__form-actions {
	display: flex;
	gap: var(--nc-gcs-space-sm, 8px);
}

.nc-print-btn--sm {
	font-size: 12px;
	padding: 4px 8px;
}
</style>
