<template>
	<div class="pause">
		<h3 class="pause__title">Pause / filament change at height</h3>
		<p class="pause__hint">
			Insert a filament change (M600) or pause (M601) at a Z height — for
			multi-colour prints, embedding magnets/nuts, or inspecting a print.
		</p>

		<ul v-if="pauses.length" class="pause__list">
			<li v-for="(p, i) in pauses" :key="i" class="pause__item">
				<span class="pause__badge" :class="'pause__badge--' + p.type">
					{{ p.type === 'filament_change' ? 'Filament change' : 'Pause' }}
				</span>
				<span class="pause__z">at Z = {{ p.height }} mm</span>
				<button type="button" class="pause__remove" aria-label="Remove" @click="remove(i)">✕</button>
			</li>
		</ul>
		<p v-else class="pause__empty">No pauses. The print runs start to finish.</p>

		<div class="pause__add">
			<label class="pause__field">
				Height (mm)
				<input v-model.number="newHeight" type="number" min="0.1" step="0.1" placeholder="e.g. 5.0">
			</label>
			<label class="pause__field">
				Type
				<select v-model="newType">
					<option value="filament_change">Filament change (M600)</option>
					<option value="pause">Pause (M601)</option>
				</select>
			</label>
			<button type="button" class="pause__btn" :disabled="!canAdd" @click="add">Add</button>
		</div>
		<p v-if="error" class="pause__error">{{ error }}</p>
	</div>
</template>

<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'

export default {
	name: 'PausePlanner',
	data() {
		return { newHeight: '', newType: 'filament_change', error: '' }
	},
	computed: {
		...mapStores(usePrintStore),
		pauses() {
			return this.printStore.pauses
		},
		canAdd() {
			return Number(this.newHeight) > 0
		},
	},
	methods: {
		add() {
			this.error = ''
			if (!this.printStore.addPause({ height: this.newHeight, type: this.newType })) {
				this.error = 'Enter a positive height in mm.'
				return
			}
			this.newHeight = ''
		},
		remove(i) {
			this.printStore.removePause(i)
		},
	},
}
</script>

<style scoped lang="scss">
.pause { display: flex; flex-direction: column; gap: 8px; }
.pause__title { margin: 0; font-size: 0.95rem; }
.pause__hint, .pause__empty { margin: 0; font-size: 0.8rem; color: var(--color-text-maxcontrast, #8b949e); }
.pause__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.pause__item {
	display: flex; align-items: center; gap: 8px;
	padding: 4px 8px; border: 1px solid var(--color-border, #30363d);
	border-radius: 6px; background: var(--color-background-hover, #21262d);
}
.pause__badge {
	font-size: 0.7rem; padding: 1px 6px; border-radius: 999px;
	background: color-mix(in srgb, var(--nc-app-accent, #4c8eda) 20%, transparent);
}
.pause__badge--pause { background: color-mix(in srgb, #d9a441 25%, transparent); }
.pause__z { font-size: 0.82rem; font-variant-numeric: tabular-nums; }
.pause__remove { margin-left: auto; appearance: none; background: none; border: none; color: var(--color-text-maxcontrast, #8b949e); cursor: pointer; }
.pause__add { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; }
.pause__field { display: flex; flex-direction: column; font-size: 0.75rem; gap: 2px; }
.pause__field input { width: 100px; }
.pause__btn {
	appearance: none; border: 1px solid var(--nc-app-accent, #4c8eda); border-radius: 6px;
	background: color-mix(in srgb, var(--nc-app-accent, #4c8eda) 18%, transparent);
	color: inherit; padding: 6px 14px; font-size: 0.82rem; cursor: pointer;
	&:disabled { opacity: 0.5; cursor: default; }
}
.pause__error { margin: 0; font-size: 0.8rem; color: var(--color-error, #e5534b); }
</style>
