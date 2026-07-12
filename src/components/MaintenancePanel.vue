<script>
import { fetchMaintenance, logMaintenance } from '@/services/maintenance-api.js'

/**
 * Maintenance / wear pillar. Reads the per-printer, per-component lifetime
 * estimates (layered on the print-history wear heuristic) and shows each
 * component with a wear bar coloured by status, plus a small form to log a
 * service action (which resets the component's hours-since-service). All figures
 * are heuristic estimates surfaced with a disclaimer; every row is scoped
 * server-side to the session user, and failures are surfaced inline, not thrown.
 */
export default {
	name: 'MaintenancePanel',
	data() {
		return {
			printers: [],
			components: {},
			disclaimer: '',
			loading: false,
			loadError: '',
			saving: false,
			// printer_id of the printer whose service form is open, or ''.
			formPrinterId: '',
			form: this.blankForm(),
		}
	},
	computed: {
		componentKeys() {
			return Object.keys(this.components || {})
		},
	},
	async mounted() {
		await this.reload()
	},
	methods: {
		blankForm() {
			return {
				component: '',
				action: 'replaced',
				cost: '',
				notes: '',
			}
		},
		async reload() {
			this.loading = true
			this.loadError = ''
			try {
				const data = await fetchMaintenance()
				this.printers = data.printers || []
				this.components = data.components || {}
				this.disclaimer = data.disclaimer || ''
			} catch (e) {
				this.loadError = e?.message || 'Could not load maintenance data'
			} finally {
				this.loading = false
			}
		},
		openForm(printerId) {
			this.formPrinterId = printerId
			this.form = this.blankForm()
			this.form.component = this.componentKeys[0] || ''
		},
		closeForm() {
			this.formPrinterId = ''
			this.form = this.blankForm()
		},
		async submit() {
			if (this.saving) {
				return
			}
			const component = (this.form.component || '').trim()
			if (!this.formPrinterId || !component) {
				this.loadError = 'Pick a component to service.'
				return
			}
			this.saving = true
			this.loadError = ''
			const payload = {
				printer_id: this.formPrinterId,
				component,
				action: this.form.action || 'replaced',
				cost: this.form.cost === '' ? '' : Number(this.form.cost),
				notes: (this.form.notes || '').trim(),
			}
			try {
				await logMaintenance(payload)
				this.closeForm()
				await this.reload()
			} catch (e) {
				this.loadError = e?.message || 'Could not log maintenance'
			} finally {
				this.saving = false
			}
		},
		barPct(comp) {
			return Math.max(0, Math.min(100, Number(comp.percent_used) || 0))
		},
		componentLabel(key) {
			// Fall back to a title-cased key when no label is known.
			return String(key)
				.replace(/_/g, ' ')
				.replace(/\b\w/g, (c) => c.toUpperCase())
		},
		lastServiced(comp) {
			if (!comp.last_action_at) {
				return 'Never serviced'
			}
			return 'Serviced ' + new Date(comp.last_action_at * 1000).toLocaleDateString()
		},
	},
}
</script>

<template>
	<div class="nc-print-card nc-print-maint">
		<h2 class="nc-print-card__title">Maintenance</h2>

		<p v-if="loadError" class="nc-print-maint__error">{{ loadError }}</p>

		<p v-if="loading && !printers.length" class="nc-print-maint__empty">Loading maintenance…</p>
		<p v-else-if="!printers.length" class="nc-print-maint__empty">
			No print history yet — component wear appears once prints are recorded.
		</p>

		<div v-else class="nc-print-maint__printers">
			<section
				v-for="printer in printers"
				:key="printer.printer_id"
				class="nc-print-maint__printer">
				<div class="nc-print-maint__printer-head">
					<span class="nc-print-maint__printer-name">
						{{ printer.printer_id || 'Printer' }}
					</span>
					<span class="nc-print-maint__printer-hours">
						{{ Math.round(printer.print_hours) }}h printed
					</span>
				</div>

				<ul class="nc-print-maint__list">
					<li
						v-for="comp in printer.components"
						:key="comp.component"
						class="nc-print-maint__comp">
						<div class="nc-print-maint__comp-head">
							<span class="nc-print-maint__comp-name">{{ comp.label }}</span>
							<span class="nc-print-maint__comp-rem">
								{{ Math.round(comp.hours_remaining) }}h left
							</span>
						</div>
						<div
							class="nc-print-maint__bar"
							role="img"
							:aria-label="`${Math.round(comp.percent_used)} percent of lifetime used`">
							<div
								class="nc-print-maint__bar-fill"
								:class="'is-' + comp.status"
								:style="{ width: barPct(comp) + '%' }" />
						</div>
						<div class="nc-print-maint__comp-meta">
							<span>{{ Math.round(comp.percent_used) }}% of {{ Math.round(comp.lifetime_hours) }}h</span>
							<span>{{ lastServiced(comp) }}</span>
						</div>
					</li>
				</ul>

				<div class="nc-print-maint__printer-actions">
					<button
						v-if="formPrinterId !== printer.printer_id"
						type="button"
						class="nc-print-btn nc-print-btn--sm"
						@click="openForm(printer.printer_id)">
						Replace / Service
					</button>
				</div>

				<!-- Service form (per printer) -->
				<form
					v-if="formPrinterId === printer.printer_id"
					class="nc-print-maint__form"
					@submit.prevent="submit">
					<p class="nc-print-section-label">Log service</p>
					<div class="nc-print-maint__fields">
						<label class="nc-print-maint__field">
							<span class="nc-print-maint__field-lbl">Component</span>
							<select v-model="form.component" class="nc-print-input">
								<option
									v-for="key in componentKeys"
									:key="key"
									:value="key">
									{{ componentLabel(key) }}
								</option>
							</select>
						</label>
						<label class="nc-print-maint__field">
							<span class="nc-print-maint__field-lbl">Action</span>
							<select v-model="form.action" class="nc-print-input">
								<option value="replaced">Replaced</option>
								<option value="cleaned">Cleaned</option>
								<option value="inspected">Inspected</option>
								<option value="lubricated">Lubricated</option>
							</select>
						</label>
						<label class="nc-print-maint__field">
							<span class="nc-print-maint__field-lbl">Cost</span>
							<input
								v-model="form.cost"
								type="number"
								min="0"
								step="0.01"
								class="nc-print-input"
								placeholder="0.00">
						</label>
						<label class="nc-print-maint__field nc-print-maint__field--wide">
							<span class="nc-print-maint__field-lbl">Notes</span>
							<input
								v-model.trim="form.notes"
								type="text"
								class="nc-print-input"
								maxlength="512"
								placeholder="Optional">
						</label>
					</div>
					<div class="nc-print-maint__form-actions">
						<button type="submit" class="nc-print-btn nc-print-btn--sm" :disabled="saving">
							Log service
						</button>
						<button
							type="button"
							class="nc-print-btn nc-print-btn--sm"
							:disabled="saving"
							@click="closeForm">
							Cancel
						</button>
					</div>
				</form>
			</section>
		</div>

		<p v-if="disclaimer" class="nc-print-maint__disclaimer">{{ disclaimer }}</p>
	</div>
</template>

<style scoped>
.nc-print-maint {
	display: flex;
	flex-direction: column;
	gap: var(--nc-gcs-space-md, 12px);
}

.nc-print-maint__error {
	color: var(--color-error, #c33);
	font-size: var(--nc-gcs-text-sm);
	margin: 0;
}

.nc-print-maint__empty {
	color: var(--nc-gcs-text-muted);
	font-size: var(--nc-gcs-text-sm);
	margin: 0;
}

.nc-print-maint__printers {
	display: flex;
	flex-direction: column;
	gap: var(--nc-gcs-space-md, 12px);
}

.nc-print-maint__printer {
	background: var(--nc-gcs-surface-2, var(--color-background-hover));
	border: 1px solid var(--nc-gcs-border, var(--color-border));
	border-radius: var(--nc-gcs-radius, 8px);
	display: flex;
	flex-direction: column;
	gap: var(--nc-gcs-space-sm, 8px);
	padding: 10px;
}

.nc-print-maint__printer-head {
	align-items: baseline;
	display: flex;
	gap: 8px;
	justify-content: space-between;
}

.nc-print-maint__printer-name {
	font-weight: 600;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.nc-print-maint__printer-hours {
	color: var(--nc-gcs-text-muted);
	flex: 0 0 auto;
	font-size: 12px;
}

.nc-print-maint__list {
	display: flex;
	flex-direction: column;
	gap: var(--nc-gcs-space-sm, 8px);
	list-style: none;
	margin: 0;
	padding: 0;
}

.nc-print-maint__comp {
	display: flex;
	flex-direction: column;
	gap: 3px;
}

.nc-print-maint__comp-head {
	align-items: baseline;
	display: flex;
	gap: 8px;
	justify-content: space-between;
}

.nc-print-maint__comp-name {
	font-weight: 500;
}

.nc-print-maint__comp-rem {
	color: var(--nc-gcs-text-muted);
	flex: 0 0 auto;
	font-size: 12px;
}

.nc-print-maint__bar {
	background: var(--color-background-dark, #ddd);
	border-radius: 4px;
	height: 8px;
	overflow: hidden;
}

.nc-print-maint__bar-fill {
	background: var(--nc-gcs-accent, var(--color-primary, #4c8eda));
	height: 100%;
	transition: width 0.2s ease;
}

.nc-print-maint__bar-fill.is-soon {
	background: var(--color-info, #4c8eda);
}

.nc-print-maint__bar-fill.is-warning {
	background: var(--color-warning, #d9a441);
}

.nc-print-maint__bar-fill.is-critical {
	background: var(--color-error, #c33);
}

.nc-print-maint__comp-meta {
	color: var(--nc-gcs-text-muted);
	display: flex;
	flex-wrap: wrap;
	font-size: 12px;
	gap: 8px;
	justify-content: space-between;
}

.nc-print-maint__printer-actions {
	display: flex;
	gap: var(--nc-gcs-space-sm, 8px);
}

.nc-print-maint__form {
	border-top: 1px solid var(--nc-gcs-border, var(--color-border));
	padding-top: var(--nc-gcs-space-sm, 8px);
}

.nc-print-maint__fields {
	display: grid;
	gap: var(--nc-gcs-space-sm, 8px);
	grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
	margin-bottom: var(--nc-gcs-space-sm, 8px);
}

.nc-print-maint__field {
	display: flex;
	flex-direction: column;
	font-size: 12px;
	gap: 2px;
}

.nc-print-maint__field--wide {
	grid-column: 1 / -1;
}

.nc-print-maint__field-lbl {
	color: var(--nc-gcs-text-muted);
}

.nc-print-maint__form-actions {
	display: flex;
	gap: var(--nc-gcs-space-sm, 8px);
}

.nc-print-maint__disclaimer {
	color: var(--nc-gcs-text-muted);
	font-size: 12px;
	margin: 0;
}

.nc-print-btn--sm {
	font-size: 12px;
	padding: 4px 8px;
}
</style>
