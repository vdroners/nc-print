<script>
import NcPrintIcon from './NcPrintIcon.vue'
import { loadCollapsibleState, saveCollapsibleState } from '@/utils/collapsible.js'

/**
 * Collapse + pin wrapper for a Print-tab panel. It renders a slim header strip
 * (title · chevron · pin) and, below it, the panel's own self-gating card via the
 * default slot. The wrapper is intentionally NOT a card and shows NO body of its
 * own — the inner panel keeps its existing card/title/`v-if` gate untouched, so
 * we avoid double-cards and never show an empty panel.
 *
 * Because the inner panels self-gate (e.g. QueuePanel renders nothing when
 * unsupported), the parent passes `:when` — the same store-derived predicate —
 * so the wrapper header hides in lockstep with the panel body.
 *
 * Collapse state persists per-id in localStorage (same store as
 * NcPrintCollapsible; keyed `print-<id>`). The pin button emits `toggle-pin`;
 * the parent (PrintTab) owns the pinned list + render order.
 */
let uid = 0

export default {
	name: 'PrintPanel',
	components: { NcPrintIcon },
	props: {
		id: { type: String, required: true },
		title: { type: String, required: true },
		icon: { type: String, default: '' },
		defaultOpen: { type: Boolean, default: true },
		pinned: { type: Boolean, default: false },
		/** Render nothing when false (mirrors the inner panel's self-gate). */
		when: { type: Boolean, default: true },
	},
	data() {
		return {
			open: loadCollapsibleState(`print-${this.id}`, this.defaultOpen),
			bodyId: `nc-print-panel-${uid++}`,
		}
	},
	mounted() {
		window.addEventListener('nc-print-focus-panel', this.onFocusRequest)
	},
	beforeDestroy() {
		window.removeEventListener('nc-print-focus-panel', this.onFocusRequest)
	},
	methods: {
		onFocusRequest(e) {
			if (e?.detail?.id !== this.id) {
				return
			}
			this.expand()
			this.$nextTick(() => {
				this.$el?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
			})
		},
		toggle() {
			this.open = !this.open
			saveCollapsibleState(`print-${this.id}`, this.open)
		},
		expand() {
			if (!this.open) {
				this.open = true
				saveCollapsibleState(`print-${this.id}`, true)
			}
		},
		onPin() {
			this.$emit('toggle-pin', this.id)
		},
	},
}
</script>

<template>
	<!--
		The root always renders and the default slot is mounted exactly once, so a
		self-reporting panel (reports: true) keeps fetching to report `visible`
		without unmount/remount thrash. When `when` is false the whole panel is
		hidden via CSS (`--hidden`) — header chrome is also skipped — but the slot
		stays alive underneath. When `when` is false the body is force-shown inside
		the hidden container so the panel keeps rendering (and thus reporting).
	-->
	<div class="nc-print-panel" :class="{ 'nc-print-panel--hidden': !when }">
		<div v-if="when" class="nc-print-panel__strip">
			<button
				type="button"
				class="nc-print-panel__btn"
				:aria-expanded="open ? 'true' : 'false'"
				:aria-controls="bodyId"
				@click="toggle">
				<NcPrintIcon
					name="chevron-down"
					:size="14"
					class="nc-print-panel__chevron"
					:class="{ 'nc-print-panel__chevron--open': open }" />
				<span class="nc-print-panel__title">
					<NcPrintIcon v-if="icon" :name="icon" :size="14" />
					{{ title }}
				</span>
			</button>
			<button
				type="button"
				class="nc-print-panel__pin"
				:class="{ 'is-pinned': pinned }"
				:aria-pressed="pinned ? 'true' : 'false'"
				:title="pinned ? 'Unpin panel' : 'Pin panel to top'"
				:aria-label="pinned ? `Unpin ${title}` : `Pin ${title} to top`"
				@click="onPin">
				<NcPrintIcon name="pin" :size="14" />
			</button>
		</div>
		<div v-show="!when || open" :id="bodyId" class="nc-print-panel__body">
			<slot />
		</div>
	</div>
</template>

<style scoped>
.nc-print-panel {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

/* Kept in the DOM (slot stays mounted so reporting panels keep fetching) but
   visually removed until the panel reports it has content. */
.nc-print-panel--hidden {
	display: none;
}

.nc-print-panel__strip {
	align-items: center;
	display: flex;
	gap: 4px;
}

.nc-print-panel__btn {
	align-items: center;
	appearance: none;
	background: none;
	border: none;
	color: var(--nc-gcs-text-muted);
	cursor: pointer;
	display: flex;
	flex: 1;
	font: inherit;
	font-size: 11px;
	font-weight: 700;
	gap: 6px;
	letter-spacing: 0.05em;
	padding: 2px;
	text-transform: uppercase;

	&:focus-visible {
		outline: 2px solid var(--nc-app-accent);
		outline-offset: 2px;
	}
}

.nc-print-panel__title {
	align-items: center;
	display: inline-flex;
	gap: 6px;
}

.nc-print-panel__chevron {
	flex: 0 0 auto;
	transition: transform 0.16s ease;
}

.nc-print-panel__chevron--open {
	transform: rotate(180deg);
}

.nc-print-panel__pin {
	appearance: none;
	background: none;
	border: none;
	border-radius: 4px;
	color: var(--nc-gcs-text-muted);
	cursor: pointer;
	line-height: 0;
	opacity: 0.35;
	padding: 4px;
	transition: opacity 0.15s, color 0.15s;

	&:hover {
		opacity: 0.9;
	}

	&.is-pinned {
		color: var(--nc-app-accent, var(--color-primary-element));
		opacity: 1;
	}

	&:focus-visible {
		outline: 2px solid var(--nc-app-accent);
		outline-offset: 2px;
	}
}

.nc-print-panel__body {
	display: flex;
	flex-direction: column;
}
</style>
