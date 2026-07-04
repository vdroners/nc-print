<template>
	<div class="col">
		<h3 class="col__title">Multi-color purge optimizer</h3>
		<p class="col__hint">
			Enter the filament colors on the plate. The optimizer finds the load
			order that minimises total purge (the flush between two colors is
			asymmetric — switching to a lighter color wastes more), and shows how
			much filament you save vs loading them as listed.
		</p>

		<div class="col__rows">
			<div v-for="(c, i) in colors" :key="i" class="col__row">
				<input type="color" class="col__swatch" :value="c" @input="setColor(i, $event.target.value)">
				<input
					type="text"
					class="col__hex"
					:value="c"
					maxlength="7"
					spellcheck="false"
					@input="setColor(i, $event.target.value)">
				<button type="button" class="col__x" title="Remove" @click="removeColor(i)">×</button>
			</div>
		</div>

		<div class="col__actions">
			<button type="button" class="col__btn" :disabled="colors.length >= 32" @click="addColor">+ Add color</button>
			<button
				type="button"
				class="col__btn col__btn--primary"
				:disabled="busy || colors.length < 2"
				@click="optimize">
				{{ busy ? 'Optimizing…' : 'Optimize order' }}
			</button>
		</div>

		<p v-if="error" class="col__error">{{ error }}</p>

		<div v-if="result" class="col__result">
			<div class="col__seq">
				<span
					v-for="(hex, i) in result.orderedColors"
					:key="i"
					class="col__seq-item">
					<span class="col__seq-dot" :style="{ background: hex }" />
					<span class="col__seq-label">{{ result.names[i] || hex }}</span>
					<span v-if="i < result.orderedColors.length - 1" class="col__seq-arrow">→</span>
				</span>
			</div>
			<p class="col__savings">
				<template v-if="result.savedG > 0">
					Saves <strong>{{ result.savedG }} g</strong> of purge ({{ result.savedPct }}%)
					vs load-as-listed — {{ result.optimizedFlushG }} g vs {{ result.baselineFlushG }} g.
				</template>
				<template v-else>
					Already optimal — {{ result.optimizedFlushG }} g of purge, no reorder saves more.
				</template>
			</p>
			<p class="col__method">Method: {{ result.method }}</p>
		</div>
	</div>
</template>

<script>
import { optimizeColorOrder } from '@/services/color-order-api.js'

const DEFAULT_COLORS = ['#000000', '#FFFFFF']

export default {
	name: 'ColorOrderPanel',
	data() {
		return {
			colors: [...DEFAULT_COLORS],
			busy: false,
			error: '',
			result: null,
		}
	},
	methods: {
		addColor() {
			if (this.colors.length < 32) {
				this.colors.push('#808080')
			}
		},
		removeColor(i) {
			this.colors.splice(i, 1)
			this.result = null
		},
		setColor(i, val) {
			let v = String(val || '').trim()
			if (v && !v.startsWith('#')) {
				v = '#' + v
			}
			this.$set(this.colors, i, v.toUpperCase())
			this.result = null
		},
		async optimize() {
			const valid = this.colors.filter((c) => /^#[0-9A-Fa-f]{6}$/.test(c))
			if (valid.length < 2) {
				this.error = 'Enter at least two valid #RRGGBB colors.'
				return
			}
			this.busy = true
			this.error = ''
			this.result = null
			try {
				this.result = await optimizeColorOrder({ colors: valid })
			} catch (e) {
				this.error = e?.response?.data?.message || e?.message || 'Optimization failed'
			} finally {
				this.busy = false
			}
		},
	},
}
</script>

<style scoped lang="scss">
.col { display: flex; flex-direction: column; gap: 8px; }
.col__title { margin: 0; font-size: 0.95rem; }
.col__hint { margin: 0; font-size: 0.8rem; color: var(--color-text-maxcontrast, #8b949e); }
.col__rows { display: flex; flex-direction: column; gap: 6px; }
.col__row { display: flex; align-items: center; gap: 8px; }
.col__swatch { width: 34px; height: 28px; padding: 0; border: 1px solid var(--color-border, #30363d); border-radius: 6px; background: none; cursor: pointer; }
.col__hex { width: 96px; font-family: monospace; }
.col__x {
	appearance: none; border: 1px solid var(--color-border, #30363d); border-radius: 6px;
	background: var(--color-background-hover, #21262d); color: inherit; width: 28px; height: 28px;
	font-size: 1rem; line-height: 1; cursor: pointer;
}
.col__actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.col__btn {
	appearance: none; border: 1px solid var(--color-border, #30363d); border-radius: 6px;
	background: var(--color-background-hover, #21262d); color: inherit; padding: 6px 14px;
	font-size: 0.82rem; cursor: pointer;
	&:disabled { opacity: 0.5; cursor: default; }
	&--primary { background: color-mix(in srgb, var(--nc-app-accent, #4c8eda) 18%, transparent); border-color: var(--nc-app-accent, #4c8eda); }
}
.col__error { margin: 0; font-size: 0.8rem; color: var(--color-error, #e5534b); }
.col__result {
	display: flex; flex-direction: column; gap: 6px;
	padding: 10px; border: 1px solid var(--color-border, #30363d); border-radius: 8px;
	background: var(--color-background-dark, #161b22);
}
.col__seq { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.col__seq-item { display: inline-flex; align-items: center; gap: 6px; font-size: 0.8rem; }
.col__seq-dot { width: 16px; height: 16px; border-radius: 4px; border: 1px solid var(--color-border, #30363d); }
.col__seq-arrow { color: var(--color-text-maxcontrast, #8b949e); margin: 0 2px; }
.col__savings { margin: 0; font-size: 0.82rem; }
.col__method { margin: 0; font-size: 0.7rem; color: var(--color-text-maxcontrast, #8b949e); }
</style>
