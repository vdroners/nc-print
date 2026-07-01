<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'

export default {
	name: 'ThreeMfObjectPicker',
	computed: {
		...mapStores(usePrintStore),
		items() {
			return this.printStore.threeMfBuildItems
		},
		selectedIds: {
			get() {
				return this.printStore.threeMfSelectedIds
			},
			set(ids) {
				this.printStore.setThreeMfSelection(ids)
			},
		},
		showPicker() {
			return this.printStore.model.name?.toLowerCase().endsWith('.3mf')
				&& this.items.length > 1
		},
	},
	methods: {
		isChecked(id) {
			return this.selectedIds.includes(String(id))
		},
		onToggle(id, event) {
			const sid = String(id)
			let next = [...this.selectedIds]
			if (event.target.checked) {
				if (!next.includes(sid)) {
					next.push(sid)
				}
			} else {
				next = next.filter(x => x !== sid)
			}
			if (next.length === 0) {
				next = [sid]
			}
			this.selectedIds = next
			this.$emit('selection-change', next)
		},
	},
}
</script>

<template>
	<div v-if="showPicker" class="nc-print-card nc-print-3mf-picker">
		<h2 class="nc-print-card__title">3MF build items</h2>
		<p class="nc-print-3mf-picker__hint">
			Select objects to include in preview and slice conversion.
		</p>
		<ul class="nc-print-3mf-picker__list">
			<li v-for="item in items" :key="item.id">
				<label>
					<input
						type="checkbox"
						:checked="isChecked(item.id)"
						:disabled="!item.printable"
						@change="onToggle(item.id, $event)">
					<span>{{ item.name }}</span>
					<span v-if="!item.printable" class="nc-print-3mf-picker__tag">non-printable</span>
				</label>
			</li>
		</ul>
	</div>
</template>

<style scoped>
.nc-print-3mf-picker__hint {
	color: var(--nc-gcs-text-muted);
	font-size: var(--nc-gcs-text-sm);
	margin: 0 0 var(--nc-gcs-space-sm);
}

.nc-print-3mf-picker__list {
	list-style: none;
	margin: 0;
	padding: 0;
}

.nc-print-3mf-picker__list li + li {
	margin-top: 6px;
}

.nc-print-3mf-picker__list label {
	align-items: center;
	cursor: pointer;
	display: flex;
	font-size: var(--nc-gcs-text-sm);
	gap: 8px;
}

.nc-print-3mf-picker__tag {
	color: var(--nc-gcs-text-muted);
	font-size: 11px;
}
</style>
