<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { checkPrintGuard } from '@/services/print-guard-api.js'
import { formatProgressPercent } from '@/utils/print-honesty.js'

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
	computed: {
		...mapStores(usePrintStore),
		/**
		 * Same progress the Print tab shows. The guard snapshot is only a
		 * fallback before the printer poll has connected, and it now uses
		 * virtual_sdcard (0–100) rather than display_status.
		 */
		progressLabel() {
			const live = this.printStore.printerState
			if (live?.connected) {
				return formatProgressPercent(live.progress)
			}
			const raw = Number(this.snapshot?.progress)
			if (!Number.isFinite(raw)) {
				return ''
			}
			return `${Math.round(raw)}%`
		},
		stateLabel() {
			const live = this.printStore.printerState
			if (live?.connected && live.state) {
				return live.state
			}
			return this.snapshot?.state || ''
		},
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
					printerId: this.printStore.selectedPrinterId || '',
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
		<p v-if="stateLabel || progressLabel" class="nc-print-guard__meta">
			State: {{ stateLabel || '—' }} · progress: {{ progressLabel || '—' }}
		</p>
	</div>
</template>

<style scoped>
.nc-print-guard { display: flex; flex-direction: column; gap: 8px; }
.nc-print-guard__error { color: var(--color-error, #e9322d); }
.nc-print-guard__ok { color: var(--color-text-maxcontrast, #666); }
.nc-print-guard__alerts { margin: 0; padding-left: 1.2rem; }
</style>
