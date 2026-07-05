<script>
import NcPrintIcon from './NcPrintIcon.vue'
import { loadCollapsibleState, saveCollapsibleState } from '@/utils/collapsible.js'

let uid = 0

export default {
	name: 'NcPrintCollapsible',
	components: { NcPrintIcon },
	props: {
		/** Stable id used as the localStorage persistence key. */
		id: { type: String, required: true },
		title: { type: String, required: true },
		icon: { type: String, default: '' },
		/** Default open state when nothing is persisted. */
		defaultOpen: { type: Boolean, default: true },
	},
	data() {
		return {
			open: loadCollapsibleState(this.id, this.defaultOpen),
			bodyId: `nc-print-collapsible-${uid++}`,
		}
	},
	methods: {
		toggle() {
			this.open = !this.open
			saveCollapsibleState(this.id, this.open)
			this.$emit('toggle', this.open)
		},
		expand() {
			if (!this.open) {
				this.open = true
				saveCollapsibleState(this.id, true)
				this.$emit('toggle', true)
			}
		},
	},
}
</script>

<template>
	<section class="nc-print-collapsible" :class="{ 'nc-print-collapsible--open': open }">
		<h2 class="nc-print-collapsible__header">
			<button
				type="button"
				class="nc-print-collapsible__btn"
				:aria-expanded="open ? 'true' : 'false'"
				:aria-controls="bodyId"
				@click="toggle">
				<span class="nc-print-collapsible__title">
					<NcPrintIcon v-if="icon" :name="icon" :size="16" />
					{{ title }}
				</span>
				<NcPrintIcon
					name="chevron-down"
					:size="16"
					class="nc-print-collapsible__chevron"
					:class="{ 'nc-print-collapsible__chevron--open': open }" />
			</button>
		</h2>
		<div v-show="open" :id="bodyId" class="nc-print-collapsible__body">
			<slot />
		</div>
	</section>
</template>

<style scoped>
.nc-print-collapsible {
	display: flex;
	flex-direction: column;
}

.nc-print-collapsible__header {
	margin: 0;
}

.nc-print-collapsible__btn {
	align-items: center;
	appearance: none;
	background: none;
	border: none;
	border-bottom: 1px solid var(--nc-gcs-border);
	color: var(--nc-gcs-text-muted);
	cursor: pointer;
	display: flex;
	font: inherit;
	font-size: 11px;
	font-weight: 700;
	justify-content: space-between;
	letter-spacing: 0.05em;
	padding: 0 2px 6px;
	text-transform: uppercase;
	width: 100%;

	&:focus-visible {
		outline: 2px solid var(--nc-app-accent);
		outline-offset: 2px;
	}
}

.nc-print-collapsible__title {
	align-items: center;
	display: inline-flex;
	gap: 8px;
}

.nc-print-collapsible__chevron {
	transition: transform 0.16s ease;
}

.nc-print-collapsible__chevron--open {
	transform: rotate(180deg);
}

.nc-print-collapsible__body {
	display: flex;
	flex-direction: column;
	gap: var(--nc-gcs-space-md);
	padding-top: var(--nc-gcs-space-md);
}
</style>
