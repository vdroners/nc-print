<script>
import { checkPrintGuard } from '@/services/print-guard-api.js'

export default {
	name: 'PrintGuardPanel',
	data() {
		return {
			alerts: [],
			snapshot: null,
			loading: false,
			error: '',
			timer: null,
		}
	},
	async mounted() {
		await this.refresh(false)
		this.timer = setInterval(() => this.refresh(true), 60000)
	},
	beforeDestroy() {
		if (this.timer) clearInterval(this.timer)
	},
	methods: {
		async refresh(notify) {
			this.loading = true
			this.error = ''
			try {
				const data = await checkPrintGuard({
					prev: this.snapshot,
					notify: !!notify && (this.alerts?.length >= 0),
				})
				if (!data?.ok) {
					this.error = data?.error || 'Guard check failed'
					return
				}
				this.alerts = data.alerts || []
				this.snapshot = data.snapshot
			} catch (e) {
				this.error = e?.message || 'Guard unreachable'
			} finally {
				this.loading = false
			}
		},
	},
}
</script>

<template>
	<div class="nc-print-guard">
		<p class="nc-print-guard__hint">
			Lite Print Guard — stall, temp deviation, filament sensor (notify only).
		</p>
		<button type="button" :disabled="loading" @click="refresh(false)">
			{{ loading ? 'Checking…' : 'Check now' }}
		</button>
		<p v-if="error" class="nc-print-guard__error">{{ error }}</p>
		<ul v-if="alerts.length" class="nc-print-guard__alerts">
			<li v-for="(a, i) in alerts" :key="i">
				<strong>{{ a.type }}</strong> ({{ a.severity }}) — {{ a.message }}
			</li>
		</ul>
		<p v-else class="nc-print-guard__ok">No active guard alerts.</p>
		<p v-if="snapshot" class="nc-print-guard__meta">
			State: {{ snapshot.state }} · progress: {{ snapshot.progress != null ? Math.round(snapshot.progress) + '%' : '—' }}
		</p>
	</div>
</template>

<style scoped>
.nc-print-guard { display: flex; flex-direction: column; gap: 8px; }
.nc-print-guard__error { color: var(--color-error, #e9322d); }
.nc-print-guard__ok { color: var(--color-text-maxcontrast, #666); }
.nc-print-guard__alerts { margin: 0; padding-left: 1.2rem; }
</style>
