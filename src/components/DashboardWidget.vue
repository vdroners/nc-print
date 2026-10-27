<template>
	<div class="nc-print-dash">
		<div v-if="loading" class="nc-print-dash__muted">Loading printer status…</div>
		<div v-else-if="error" class="nc-print-dash__muted">{{ error }}</div>
		<template v-else>
			<div class="nc-print-dash__row">
				<span class="nc-print-dash__state" :class="stateClass">{{ stateLabel }}</span>
				<span v-if="displayFilename" class="nc-print-dash__file">{{ displayFilename }}</span>
			</div>
			<p v-if="loss" class="nc-print-dash__stale">
				{{ loss.lastSeenLabel }}
				<span v-if="loss.active"> · {{ loss.label }} {{ lossPct }}%</span>
			</p>
			<div v-if="isPrinting" class="nc-print-dash__progress">
				<div class="nc-print-dash__bar">
					<div class="nc-print-dash__fill" :style="{ width: pct + '%' }" />
				</div>
				<span class="nc-print-dash__pct">{{ pct }}%</span>
			</div>
			<div class="nc-print-dash__meta">
				<span v-if="etaLabel">{{ etaLabel }}</span>
				<span v-if="tempLabel">{{ tempLabel }}</span>
			</div>
			<a :href="appUrl" class="nc-print-dash__link">Open NC 3D Print →</a>
		</template>
	</div>
</template>

<script>
import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'
import { snapshotFromPrinterState, staleJobView } from '@/utils/link-loss.js'

export default {
	name: 'DashboardWidget',
	data() {
		return {
			loading: true,
			error: '',
			state: {},
			timer: null,
			lastContact: null,
		}
	},
	computed: {
		appUrl() {
			return generateUrl('/apps/nc_print/')
		},
		loss() {
			if (this.state.connected || !this.lastContact) {
				return null
			}
			return staleJobView(this.lastContact, Date.now())
		},
		stateLabel() {
			if (this.loss) {
				return 'Link lost'
			}
			const s = (this.state.state || 'unknown').toLowerCase()
			return s.charAt(0).toUpperCase() + s.slice(1)
		},
		displayFilename() {
			return this.loss?.filename || this.state.filename || ''
		},
		lossPct() {
			return Math.round((this.loss?.progress || 0) * 100)
		},
		stateClass() {
			const s = (this.state.state || '').toLowerCase()
			return {
				'is-printing': s === 'printing',
				'is-complete': s === 'complete',
				'is-error': s === 'error',
			}
		},
		isPrinting() {
			return (this.state.state || '').toLowerCase() === 'printing'
		},
		pct() {
			return Math.round((this.state.progress || 0) * 100)
		},
		etaLabel() {
			const remaining = this.state.printTimeLeft ?? this.state.eta_s
			if (!(remaining > 0)) {
				return ''
			}
			const h = Math.floor(remaining / 3600)
			const m = Math.round((remaining % 3600) / 60)
			return h > 0 ? `~${h}h ${m}m left` : `~${m}m left`
		},
		tempLabel() {
			const e = this.state.extruderTemp
			const b = this.state.bedTemp
			if (e == null && b == null) {
				return ''
			}
			const parts = []
			if (e != null) {
				parts.push(`Nozzle ${Math.round(e)}°`)
			}
			if (b != null) {
				parts.push(`Bed ${Math.round(b)}°`)
			}
			return parts.join(' · ')
		},
	},
	mounted() {
		this.refresh()
		this.timer = setInterval(this.refresh, 15000)
	},
	beforeDestroy() {
		if (this.timer) {
			clearInterval(this.timer)
		}
	},
	methods: {
		async refresh() {
			try {
				const { data } = await axios.get(generateUrl('/apps/nc_print/api/printer/state'))
				const next = data || {}
				if (next.connected) {
					this.lastContact = snapshotFromPrinterState({
						connected: true,
						state: next.state,
						filename: next.filename,
						progress: next.progress,
						printDuration: next.print_duration ?? next.printDuration,
					}, Date.now())
				}
				this.state = next
				this.error = ''
			} catch (e) {
				if (this.lastContact) {
					this.state = { ...this.state, connected: false, state: 'offline' }
					this.error = ''
				} else {
					this.error = 'Printer status unavailable'
				}
			} finally {
				this.loading = false
			}
		},
	},
}
</script>

<style scoped>
.nc-print-dash { display: flex; flex-direction: column; gap: 8px; padding: 4px 2px; }
.nc-print-dash__muted { color: var(--color-text-maxcontrast, #8b949e); font-size: 0.85rem; }
.nc-print-dash__row { display: flex; align-items: baseline; gap: 8px; }
.nc-print-dash__state { font-weight: 600; }
.nc-print-dash__state.is-printing { color: var(--color-primary, #4c8eda); }
.nc-print-dash__state.is-complete { color: var(--color-success, #4caf50); }
.nc-print-dash__state.is-error { color: var(--color-error, #e5534b); }
.nc-print-dash__file { font-size: 0.82rem; color: var(--color-text-maxcontrast, #8b949e); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nc-print-dash__progress { display: flex; align-items: center; gap: 8px; }
.nc-print-dash__bar { flex: 1; height: 8px; border-radius: 4px; background: var(--color-background-dark, #2c2c2c); overflow: hidden; }
.nc-print-dash__fill { height: 100%; background: var(--color-primary, #4c8eda); }
.nc-print-dash__pct { font-size: 0.78rem; min-width: 34px; text-align: right; }
.nc-print-dash__meta { display: flex; gap: 12px; font-size: 0.78rem; color: var(--color-text-maxcontrast, #8b949e); }
.nc-print-dash__stale { margin: 0; font-size: 0.78rem; color: var(--color-warning, #eab308); }
.nc-print-dash__link { font-size: 0.82rem; }
</style>
