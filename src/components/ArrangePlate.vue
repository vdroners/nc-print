<template>
	<div class="arrange">
		<h3 class="arrange__title">Arrange plate</h3>
		<p class="arrange__hint">
			Add extra models to slice together on one plate. The engine auto-arranges
			them so they don't overlap.
		</p>

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
				type="button"
				class="arrange__btn arrange__btn--primary"
				:disabled="busy || models.length === 0"
				@click="sliceArranged">
				{{ busy ? progressLabel : `Slice ${totalCount} models arranged` }}
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
			models: [],
			busy: false,
			error: '',
			progressLabel: 'Slicing…',
			infillPatterns: ['grid', 'gyroid', 'honeycomb', 'cubic', 'concentric', 'rectilinear'],
		}
	},
	computed: {
		...mapStores(usePrintStore),
		totalCount() {
			// current prepared model + added models
			return this.models.length + (this.printStore.model?.name ? 1 : 0)
		},
	},
	methods: {
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
	},
}
</script>

<style scoped lang="scss">
.arrange {
	display: flex;
	flex-direction: column;
	gap: 8px;
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
