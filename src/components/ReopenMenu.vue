<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { TABS } from '@/constants/tabs.js'
import { buildReopenList } from '@/utils/reopen.js'
import NcPrintIcon from './NcPrintIcon.vue'

export default {
	name: 'ReopenMenu',
	components: { NcPrintIcon },
	props: {
		/** Render as a full-width inline button (e.g. Print idle panel) instead of a chrome menu. */
		inline: { type: Boolean, default: false },
	},
	data() {
		return { open: false }
	},
	computed: {
		...mapStores(usePrintStore),
		items() {
			return buildReopenList(this.printStore.recentModels, this.printStore.jobHistory)
		},
		hasItems() {
			return this.items.length > 0
		},
	},
	mounted() {
		document.addEventListener('click', this.onDocClick)
	},
	beforeDestroy() {
		document.removeEventListener('click', this.onDocClick)
	},
	methods: {
		toggle() {
			this.open = !this.open
		},
		onDocClick(e) {
			if (this.open && !this.$el.contains(e.target)) {
				this.open = false
			}
		},
		relativeTime(at) {
			if (!at) {
				return ''
			}
			const secs = Math.max(0, Math.round((Date.now() - at) / 1000))
			if (secs < 60) {
				return 'just now'
			}
			if (secs < 3600) {
				return `${Math.round(secs / 60)}m ago`
			}
			if (secs < 86400) {
				return `${Math.round(secs / 3600)}h ago`
			}
			return `${Math.round(secs / 86400)}d ago`
		},
		async choose(item) {
			this.open = false
			if (item.type === 'model') {
				await this.printStore.loadRecentModel(item.entry)
				this.printStore.setActiveTab(TABS.PREPARE)
			} else {
				await this.printStore.replayJobSlice(item.entry)
			}
		},
	},
}
</script>

<template>
	<div class="nc-print-reopen" :class="{ 'nc-print-reopen--inline': inline }">
		<button
			type="button"
			class="nc-print-btn"
			:class="{ 'nc-print-btn--small': !inline }"
			:disabled="!hasItems"
			:aria-expanded="open ? 'true' : 'false'"
			aria-haspopup="menu"
			:title="hasItems ? 'Reopen a recent model or slice job' : 'No recent projects yet'"
			@click.stop="toggle">
			<NcPrintIcon name="folder" :size="16" />
			Open recent
			<NcPrintIcon v-if="!inline" name="chevron-down" :size="14" />
		</button>
		<ul v-if="open && hasItems" class="nc-print-reopen__menu" role="menu">
			<li v-for="item in items" :key="item.key" role="none">
				<button
					type="button"
					class="nc-print-reopen__item"
					role="menuitem"
					@click="choose(item)">
					<NcPrintIcon :name="item.type === 'model' ? 'cube' : 'layers'" :size="16" />
					<span class="nc-print-reopen__label">{{ item.label }}</span>
					<span class="nc-print-reopen__meta">{{ item.type === 'model' ? 'Model' : 'Slice' }} · {{ relativeTime(item.at) }}</span>
				</button>
			</li>
		</ul>
	</div>
</template>

<style scoped>
.nc-print-reopen {
	position: relative;
}

.nc-print-reopen--inline .nc-print-btn {
	width: 100%;
}

.nc-print-reopen__menu {
	background: var(--nc-gcs-bg-surface);
	border: 1px solid var(--nc-gcs-border);
	border-radius: var(--nc-gcs-radius);
	box-shadow: var(--nc-gcs-shadow);
	list-style: none;
	margin: 4px 0 0;
	max-height: 320px;
	min-width: 260px;
	overflow-y: auto;
	padding: 4px;
	position: absolute;
	right: 0;
	top: 100%;
	z-index: 20;
}

.nc-print-reopen--inline .nc-print-reopen__menu {
	left: 0;
	right: 0;
}

.nc-print-reopen__item {
	align-items: center;
	appearance: none;
	background: none;
	border: none;
	border-radius: var(--nc-gcs-radius-sm);
	color: var(--nc-gcs-text-primary);
	cursor: pointer;
	display: flex;
	font: inherit;
	gap: 8px;
	padding: 8px 10px;
	text-align: left;
	width: 100%;

	&:hover {
		background: var(--nc-gcs-bg-elevated);
	}
}

.nc-print-reopen__label {
	flex: 1 1 auto;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.nc-print-reopen__meta {
	color: var(--nc-gcs-text-muted);
	flex: 0 0 auto;
	font-size: var(--nc-gcs-text-sm);
}
</style>
