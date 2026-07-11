<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { formatPrintTime } from '@/services/slicer-utils.js'
import NcPrintIcon from './NcPrintIcon.vue'

/**
 * Sticky print-status bar for the top of the Print tab. It sticks BELOW the
 * chrome/workflow bar (top: --nc-print-chrome-h) so it never clips it. To avoid
 * duplicating the Print-control card, it watches that card with an
 * IntersectionObserver: while the card is on-screen the bar collapses to a slim
 * one-liner (filename + % + controls); once the card scrolls off it expands to
 * add ETA. The full progress bar lives only on the control card — not repeated
 * here. Controls delegate to the shared store actions (single source of truth
 * with the control card + command palette). Idle → renders nothing.
 */
export default {
	name: 'PrintStatusBar',
	components: { NcPrintIcon },
	data() {
		return {
			// True when the Print-control card is scrolled out of view; drives the
			// "expanded" bar (adds ETA). Starts false (card assumed visible on load).
			cardOffscreen: false,
			_observer: null,
		}
	},
	computed: {
		...mapStores(usePrintStore),
		controls() {
			return this.printStore.printerControls
		},
		visible() {
			const st = this.printStore.printerState
			return st.connected
				&& (this.controls.isActive || !!st.filename)
				&& !this.controls.isComplete
		},
		filename() {
			return this.printStore.printerState.filename || 'Print job'
		},
		paused() {
			return (this.printStore.printerState.state || '').toLowerCase() === 'paused'
		},
		pct() {
			const p = (this.printStore.printerState.progress || 0) * 100
			return Math.max(0, Math.min(100, p))
		},
		pctLabel() {
			return this.pct > 0 && this.pct < 1 ? `${this.pct.toFixed(1)}%` : `${Math.round(this.pct)}%`
		},
		etaLabel() {
			const remaining = this.printStore.remainingPrintSeconds
			return remaining == null ? null : `~${formatPrintTime(remaining)} left`
		},
		busy() {
			return this.printStore.printControlBusy
		},
	},
	mounted() {
		this._setupObserver()
	},
	updated() {
		// The control card mounts/unmounts with print state; re-bind if needed.
		if (this.visible && !this._observer) {
			this.$nextTick(() => this._setupObserver())
		}
	},
	beforeDestroy() {
		if (this._observer) {
			this._observer.disconnect()
			this._observer = null
		}
	},
	methods: {
		_setupObserver() {
			if (this._observer || typeof IntersectionObserver === 'undefined') {
				return
			}
			const card = document.querySelector('[data-print-control-card]')
			if (!card) {
				return
			}
			this._observer = new IntersectionObserver((entries) => {
				this.cardOffscreen = !entries[0]?.isIntersecting
			}, { threshold: 0 })
			this._observer.observe(card)
		},
		onPause() {
			return this.printStore.printPause()
		},
		onResume() {
			return this.printStore.printResume()
		},
		onCancel() {
			// Confirm inline — the full modal lives on the control card; here a
			// native confirm keeps the sticky bar lightweight.
			// eslint-disable-next-line no-alert
			if (window.confirm(`Cancel print "${this.filename}"?`)) {
				return this.printStore.printCancel()
			}
		},
	},
}
</script>

<template>
	<div v-if="visible" class="nc-print-statusbar" role="status" aria-live="polite">
		<div class="nc-print-statusbar__info">
			<NcPrintIcon :name="paused ? 'pause' : 'printer'" :size="16" />
			<span class="nc-print-statusbar__name" :title="filename">{{ filename }}</span>
			<span class="nc-print-statusbar__pct">{{ pctLabel }}</span>
			<!-- ETA only when the control card (which shows it in full) is scrolled off. -->
			<span v-if="cardOffscreen && etaLabel" class="nc-print-statusbar__eta">{{ etaLabel }}</span>
		</div>
		<div class="nc-print-statusbar__actions">
			<button
				v-if="!paused"
				type="button"
				class="nc-print-btn nc-print-btn--sm"
				:disabled="busy || !controls.canPause"
				@click="onPause">
				<NcPrintIcon name="pause" :size="13" /> Pause
			</button>
			<button
				v-else
				type="button"
				class="nc-print-btn nc-print-btn--sm nc-print-btn--primary"
				:disabled="busy || !controls.canResume"
				@click="onResume">
				<NcPrintIcon name="play" :size="13" /> Resume
			</button>
			<button
				type="button"
				class="nc-print-btn nc-print-btn--sm nc-print-btn--danger"
				:disabled="busy || !controls.canCancel"
				@click="onCancel">
				<NcPrintIcon name="stop" :size="13" /> Cancel
			</button>
		</div>
	</div>
</template>

<style scoped>
.nc-print-statusbar {
	align-items: center;
	background: var(--nc-gcs-surface, var(--color-main-background));
	border: 1px solid var(--nc-gcs-border);
	border-radius: var(--nc-gcs-radius, 8px);
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
	display: flex;
	flex-wrap: wrap;
	gap: var(--nc-gcs-space-sm, 8px);
	padding: 8px 12px;
	position: sticky;
	/* Stick BELOW the chrome/workflow bar (which is sticky top:0 z-index:3), not
	   over it — same pattern as WorkspaceRail. */
	top: var(--nc-print-chrome-h, 0px);
	z-index: 2;
}

.nc-print-statusbar__info {
	align-items: center;
	display: flex;
	flex: 1 1 200px;
	gap: 8px;
	min-width: 0;
}

.nc-print-statusbar__name {
	font-weight: 600;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.nc-print-statusbar__pct {
	color: var(--nc-app-accent, var(--color-primary-element));
	font-variant-numeric: tabular-nums;
	font-weight: 700;
}

.nc-print-statusbar__eta {
	color: var(--nc-gcs-text-muted);
	font-size: var(--nc-gcs-text-sm);
	white-space: nowrap;
}

.nc-print-statusbar__actions {
	display: flex;
	gap: 6px;
}

.nc-print-btn--sm {
	font-size: 12px;
	padding: 4px 8px;
}
</style>
