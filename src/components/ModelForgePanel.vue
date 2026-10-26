<script>
import { listGenerators, generateModel } from '@/services/model-forge-api.js'
import { usePrintStore } from '@/store/print.js'
import { TABS } from '@/constants/tabs.js'

export default {
	name: 'ModelForgePanel',
	data() {
		return {
			generators: [],
			selected: 'cable-clip',
			loading: false,
			error: '',
			optionsJson: '{}',
		}
	},
	async mounted() {
		try {
			const data = await listGenerators()
			this.generators = data.generators || []
			if (this.generators.length && !this.generators.find((g) => g.id === this.selected)) {
				this.selected = this.generators[0].id
			}
		} catch (e) {
			this.error = e?.message || 'Could not list generators'
		}
	},
	methods: {
		async generate() {
			this.loading = true
			this.error = ''
			let opts = {}
			try {
				opts = JSON.parse(this.optionsJson || '{}')
			} catch {
				this.error = 'Options must be valid JSON'
				this.loading = false
				return
			}
			try {
				const blob = await generateModel(this.selected, opts, '3mf')
				const name = `${this.selected}.3mf`
				const file = new File([blob], name, { type: 'application/octet-stream' })
				const store = usePrintStore()
				if (store.setModel(file, 'model-forge', { generator: this.selected })) {
					store.activeTab = TABS.PREPARE
				}
			} catch (e) {
				this.error = e?.message || 'Generate failed'
			} finally {
				this.loading = false
			}
		},
	},
}
</script>

<template>
	<div class="nc-print-modelforge">
		<p class="nc-print-modelforge__hint">
			Parametric Model Forge v1 (10 generators). Output opens in Prepare as 3MF.
		</p>
		<label>
			Generator
			<select v-model="selected">
				<option v-for="g in generators" :key="g.id" :value="g.id">{{ g.name }}</option>
			</select>
		</label>
		<label>
			Options (JSON)
			<textarea v-model="optionsJson" rows="4" placeholder='{"cableDiameter":6}' />
		</label>
		<button type="button" :disabled="loading" @click="generate">
			{{ loading ? 'Generating…' : 'Generate → Prepare' }}
		</button>
		<p v-if="error" class="nc-print-modelforge__error">{{ error }}</p>
	</div>
</template>

<style scoped>
.nc-print-modelforge { display: flex; flex-direction: column; gap: 10px; }
.nc-print-modelforge label { display: flex; flex-direction: column; gap: 4px; font-weight: 600; }
.nc-print-modelforge__hint, .nc-print-modelforge__error { font-size: 0.85rem; }
.nc-print-modelforge__error { color: var(--color-error, #e9322d); }
</style>
