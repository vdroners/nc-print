<template>
	<div class="arrange">
		<h3 class="arrange__title">Arrange plate</h3>
		<p class="arrange__hint">
			Add extra models to slice together on one plate. The engine auto-arranges
			them so they don't overlap. Add more plates to slice several jobs at once
			(one g-code per plate).
		</p>

		<div class="arrange__plate-tabs" role="tablist">
			<button
				v-for="(pl, i) in plates"
				:key="pl.id"
				type="button"
				class="arrange__plate-tab"
				:class="{ 'is-active': i === activePlate }"
				role="tab"
				:aria-selected="i === activePlate ? 'true' : 'false'"
				@click="selectPlate(i)">
				Plate {{ i + 1 }}
				<span class="arrange__plate-count">{{ pl.models.length + (i === 0 && printStore.model?.name ? 1 : 0) }}</span>
				<span
					v-if="plates.length > 1"
					class="arrange__plate-close"
					role="button"
					:aria-label="`Remove plate ${i + 1}`"
					@click.stop="removePlate(i)">✕</span>
			</button>
			<button type="button" class="arrange__plate-add" :disabled="busy" @click="addPlate">+ Plate</button>
		</div>

		<ul v-if="models.length" class="arrange__list">
			<li v-for="(m, i) in models" :key="m.key" class="arrange__item">
				<div class="arrange__item-head">
					<span class="arrange__name" :title="m.filename">{{ m.filename }}</span>
					<button
						type="button"
						class="arrange__perobj-toggle"
						:class="{ 'is-set': hasPerObject(m) }"
						@click="m.showSettings = !m.showSettings">
						⚙ per-object{{ hasPerObject(m) ? ' •' : '' }}
					</button>
					<select
						v-if="multiPlate"
						class="arrange__move"
						title="Move to plate"
						aria-label="Move to plate"
						@change="moveToPlate(i, Number($event.target.value)); $event.target.value = ''">
						<option value="">→ plate…</option>
						<option v-for="(pl, pi) in plates" :key="pl.id" :value="pi" :disabled="pi === activePlate">
							Plate {{ pi + 1 }}
						</option>
					</select>
					<button type="button" class="arrange__remove" @click="remove(i)" aria-label="Remove model">✕</button>
				</div>
				<div v-if="m.showSettings" class="arrange__perobj">
					<label class="arrange__perobj-field">
						Walls
						<input v-model.number="m.overrides.perimeters" type="number" min="0" step="1" placeholder="—">
					</label>
					<label class="arrange__perobj-field">
						Layer h (mm)
						<input v-model.number="m.overrides.layer_height" type="number" min="0" step="0.02" placeholder="—">
					</label>
					<label class="arrange__perobj-field">
						Infill %
						<input v-model.number="m.overrides.infill_density" type="number" min="0" max="100" step="1" placeholder="—">
					</label>
					<label class="arrange__perobj-field">
						Pattern
						<select v-model="m.overrides.infill_pattern">
							<option value="">—</option>
							<option v-for="p in infillPatterns" :key="p" :value="p">{{ p }}</option>
						</select>
					</label>
					<label class="arrange__perobj-field arrange__perobj-field--check">
						<input v-model="m.overrides.enable_support" type="checkbox"> Supports
					</label>
				</div>
			</li>
		</ul>
		<p v-else class="arrange__empty">No extra models added. The current prepared model will slice alone.</p>
		<p v-if="models.length" class="arrange__hint">
			Per-object settings override the global slice settings for that model only.
		</p>

		<div class="arrange__actions">
			<button type="button" class="arrange__btn" :disabled="busy" @click="addFromFiles">
				+ Add model from Files
			</button>
			<button
				v-if="!multiPlate"
				type="button"
				class="arrange__btn arrange__btn--primary"
				:disabled="busy || models.length === 0"
				@click="sliceArranged">
				{{ busy ? progressLabel : `Slice ${totalCount} models arranged` }}
			</button>
			<button
				v-else
				type="button"
				class="arrange__btn arrange__btn--primary"
				:disabled="busy"
				@click="sliceAllPlates">
				{{ busy ? progressLabel : `Slice ${plates.length} plates` }}
			</button>
		</div>

		<p v-if="error" class="arrange__error">{{ error }}</p>
	</div>
</template>

<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { pickFileFromNextcloud } from '@/composables/useNextcloudFilePicker.js'
import { sliceStreamMulti } from '@/services/slicer-api.js'
import { buildSliceOverrides } from '@/services/slicer-utils.js'

let _key = 0

export default {
	name: 'ArrangePlate',
	data() {
		return {
			// Multi-plate (4d): each plate has its own added-model list. Plate 0 is
			// the default; the current prepared model always rides on plate 0.
			plates: [{ id: ++_key, models: [] }],
			activePlate: 0,
			busy: false,
			error: '',
			progressLabel: 'Slicing…',
			infillPatterns: ['grid', 'gyroid', 'honeycomb', 'cubic', 'concentric', 'rectilinear'],
		}
	},
	computed: {
		...mapStores(usePrintStore),
		// The active plate's added models — the template binds to this so the
		// existing per-model UI keeps working unchanged.
		models() {
			return this.plates[this.activePlate]?.models || []
		},
		multiPlate() {
			return this.plates.length > 1
		},
		totalCount() {
			// current prepared model (plate 0 only) + added models on active plate
			const preparedOnThis = this.activePlate === 0 && this.printStore.model?.name ? 1 : 0
			return this.models.length + preparedOnThis
		},
	},
	methods: {
		addPlate() {
			this.plates.push({ id: ++_key, models: [] })
			this.activePlate = this.plates.length - 1
		},
		removePlate(i) {
			if (this.plates.length <= 1) {
				return
			}
			this.plates.splice(i, 1)
			this.activePlate = Math.min(this.activePlate, this.plates.length - 1)
		},
		selectPlate(i) {
			this.activePlate = i
		},
		moveToPlate(modelIndex, targetPlate) {
			if (targetPlate === this.activePlate) {
				return
			}
			const [m] = this.plates[this.activePlate].models.splice(modelIndex, 1)
			if (m) {
				this.plates[targetPlate].models.push(m)
			}
		},
		async addFromFiles() {
			this.error = ''
			try {
				const picked = await pickFileFromNextcloud({
					title: 'Add model to plate',
					filter: (node) => /\.(stl|3mf|obj)$/i.test(node?.basename || node?.name || ''),
				})
				if (!picked?.file) {
					return
				}
				this.models.push({
					key: ++_key,
					filename: picked.file.name,
					blob: picked.file,
					showSettings: false,
					overrides: {},
				})
			} catch (e) {
				this.error = e?.message || 'Could not add model'
			}
		},
		remove(i) {
			this.models.splice(i, 1)
		},
		hasPerObject(m) {
			return Object.values(m.overrides || {}).some(v => v !== '' && v !== null && v !== undefined && v !== false)
		},
		/**
		 * Strip empty fields from a per-object override map so we only send set
		 * values (an empty string means "use the global setting").
		 */
		cleanOverrides(ov) {
			const out = {}
			for (const [k, v] of Object.entries(ov || {})) {
				if (v === '' || v === null || v === undefined) {
					continue
				}
				if (k === 'enable_support' && v === false) {
					continue // unchecked = inherit global
				}
				out[k] = v
			}
			return out
		},
		currentPreparedModel() {
			// Reuse the store's slice-ready File for the prepared model, if any.
			const file = this.printStore.sliceModelFile?.()
			if (file) {
				return { data: file, filename: file.name || this.printStore.model?.name || 'model.stl' }
			}
			return null
		},
		async sliceArranged() {
			this.error = ''
			this.busy = true
			this.progressLabel = 'Preparing…'
			try {
				const models = []
				const objectOverrides = []
				const prepared = this.currentPreparedModel()
				if (prepared) {
					models.push(prepared)
					// The prepared model uses the global overrides (index 0).
					objectOverrides.push({})
				}
				for (const m of this.models) {
					models.push({ data: m.blob, filename: m.filename })
					objectOverrides.push(this.cleanOverrides(m.overrides))
				}
				if (!models.length) {
					throw new Error('No models to slice')
				}
				const sel = this.printStore.selection || {}
				const done = await sliceStreamMulti({
					models,
					printerId: sel.printerId,
					processId: sel.processId,
					filamentIds: sel.filamentIds?.length
						? sel.filamentIds
						: (sel.filamentId ? [sel.filamentId] : []),
					overrides: buildSliceOverrides(this.printStore.overrides || {}),
					objectOverrides,
					arrange: true,
					onEvent: (ev) => {
						if (ev.event === 'progress' && ev.parsed) {
							const pct = Math.round(ev.parsed.pct ?? 0)
							this.progressLabel = `${ev.parsed.stage || 'slicing'} ${pct}%`
						}
					},
				})
				this.printStore.applyArrangedSliceResult?.(done)
				this.$emit('sliced', done)
			} catch (e) {
				this.error = e?.message || 'Arranged slice failed'
			} finally {
				this.busy = false
			}
		},
		/**
		 * Slice every plate as its own job (one gcode per plate). Plate 0 also
		 * includes the current prepared model. Runs sequentially to respect the
		 * engine's concurrency cap.
		 */
		async sliceAllPlates() {
			this.error = ''
			this.busy = true
			const sel = this.printStore.selection || {}
			const filamentIds = sel.filamentIds?.length
				? sel.filamentIds
				: (sel.filamentId ? [sel.filamentId] : [])
			const overrides = buildSliceOverrides(this.printStore.overrides || {})
			this.printStore.startPlateBatch?.()
			try {
				for (let p = 0; p < this.plates.length; p++) {
					const models = []
					const objectOverrides = []
					if (p === 0) {
						const prepared = this.currentPreparedModel()
						if (prepared) {
							models.push(prepared)
							objectOverrides.push({})
						}
					}
					for (const m of this.plates[p].models) {
						models.push({ data: m.blob, filename: m.filename })
						objectOverrides.push(this.cleanOverrides(m.overrides))
					}
					if (!models.length) {
						continue // skip an empty plate
					}
					this.progressLabel = `Plate ${p + 1}/${this.plates.length}…`
					const done = await sliceStreamMulti({
						models,
						printerId: sel.printerId,
						processId: sel.processId,
						filamentIds,
						overrides,
						objectOverrides,
						// Multiple models on a plate still auto-arrange within THAT
						// plate; single-model plates need no arrange.
						arrange: models.length > 1,
						onEvent: (ev) => {
							if (ev.event === 'progress' && ev.parsed) {
								const pct = Math.round(ev.parsed.pct ?? 0)
								this.progressLabel = `Plate ${p + 1}/${this.plates.length} — ${ev.parsed.stage || 'slicing'} ${pct}%`
							}
						},
					})
					await this.printStore.applyPlateSliceResult?.(done, { index: p })
				}
				this.printStore.finishPlateBatch?.()
				this.$emit('sliced-plates', this.printStore.sliceJob.plates)
			} catch (e) {
				this.error = e?.message || 'Multi-plate slice failed'
			} finally {
				this.busy = false
			}
		},
	},
}
</script>

<style scoped lang="scss">
.arrange {
	display: flex;
	flex-direction: column;
	gap: 8px;
}
.arrange__plate-tabs {
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
	border-bottom: 1px solid var(--nc-gcs-border);
	padding-bottom: 6px;
}
.arrange__plate-tab {
	align-items: center;
	background: var(--color-background-hover);
	border: 1px solid var(--nc-gcs-border);
	border-radius: 6px;
	cursor: pointer;
	display: inline-flex;
	font-size: 12px;
	gap: 6px;
	padding: 4px 8px;

	&.is-active {
		background: var(--color-primary-element-light, var(--color-background-dark));
		border-color: var(--nc-app-accent, var(--color-primary-element));
		font-weight: 600;
	}
}
.arrange__plate-count {
	background: var(--nc-gcs-border);
	border-radius: 8px;
	font-size: 10px;
	min-width: 16px;
	padding: 0 5px;
	text-align: center;
}
.arrange__plate-close {
	color: var(--nc-gcs-text-muted);
	cursor: pointer;
	&:hover { color: var(--color-error, #c33); }
}
.arrange__plate-add {
	background: none;
	border: 1px dashed var(--nc-gcs-border);
	border-radius: 6px;
	cursor: pointer;
	font-size: 12px;
	padding: 4px 8px;
}
.arrange__move {
	font-size: 11px;
	padding: 2px 4px;
}
.arrange__title {
	margin: 0;
	font-size: 0.95rem;
}
.arrange__hint,
.arrange__empty {
	margin: 0;
	font-size: 0.8rem;
	color: var(--color-text-maxcontrast, #8b949e);
}
.arrange__list {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 4px;
}
.arrange__item {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 4px 8px;
	border: 1px solid var(--color-border, #30363d);
	border-radius: 6px;
	background: var(--color-background-hover, #21262d);
}
.arrange__item-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}
.arrange__name {
	flex: 1;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 0.82rem;
}
.arrange__remove {
	appearance: none;
	background: none;
	border: none;
	color: var(--color-text-maxcontrast, #8b949e);
	cursor: pointer;
	font-size: 0.9rem;
}
.arrange__perobj-toggle {
	appearance: none;
	background: none;
	border: 1px solid var(--color-border, #30363d);
	border-radius: 6px;
	color: var(--color-text-maxcontrast, #8b949e);
	cursor: pointer;
	font-size: 0.7rem;
	padding: 2px 8px;
	&.is-set {
		border-color: var(--nc-app-accent, #4c8eda);
		color: var(--nc-app-accent, #4c8eda);
	}
}
.arrange__perobj {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	padding: 6px 0 2px;
}
.arrange__perobj-field {
	display: flex;
	flex-direction: column;
	font-size: 0.7rem;
	gap: 2px;
	color: var(--color-text-maxcontrast, #8b949e);
	input[type="number"], select {
		width: 84px;
	}
	&--check {
		flex-direction: row;
		align-items: center;
		gap: 6px;
	}
}
.arrange__actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}
.arrange__btn {
	appearance: none;
	border: 1px solid var(--color-border, #30363d);
	border-radius: 6px;
	background: var(--color-background-hover, #21262d);
	color: inherit;
	padding: 6px 12px;
	font-size: 0.82rem;
	cursor: pointer;
	&:disabled {
		opacity: 0.5;
		cursor: default;
	}
	&--primary {
		background: color-mix(in srgb, var(--nc-app-accent, #4c8eda) 18%, transparent);
		border-color: var(--nc-app-accent, #4c8eda);
	}
}
.arrange__error {
	margin: 0;
	font-size: 0.8rem;
	color: var(--color-error, #e5534b);
}
</style>
