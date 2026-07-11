<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import NcPrintIcon from './NcPrintIcon.vue'

/**
 * Object list for the multi-object Prepare editor (Phase 3b). Shows every scene
 * object; clicking a row selects it (store is the single source of truth — the
 * viewport highlights the selected mesh and vice-versa). Duplicate/delete act on
 * a row. Only rendered when there's a model; collapses to nothing for an empty
 * scene. Emits actions to the parent, which drives the viewport.
 */
export default {
	name: 'SceneObjectList',
	components: { NcPrintIcon },
	computed: {
		...mapStores(usePrintStore),
		objects() {
			return this.printStore.objects
		},
		selectedId() {
			return this.printStore.selectedObjectId
		},
	},
	methods: {
		select(id) {
			this.$emit('select', id)
		},
		duplicate(id) {
			this.$emit('duplicate', id)
		},
		remove(id) {
			this.$emit('delete', id)
		},
	},
}
</script>

<template>
	<div v-if="objects.length" class="nc-print-scene-list">
		<div class="nc-print-scene-list__head">
			<span class="nc-print-scene-list__title">Objects ({{ objects.length }})</span>
		</div>
		<ul class="nc-print-scene-list__ul">
			<li
				v-for="obj in objects"
				:key="obj.id"
				class="nc-print-scene-list__row"
				:class="{ 'is-selected': obj.id === selectedId }"
				@click="select(obj.id)">
				<span class="nc-print-scene-list__name" :title="obj.name">{{ obj.name }}</span>
				<span class="nc-print-scene-list__actions">
					<button
						type="button"
						class="nc-print-scene-list__btn"
						title="Duplicate"
						:aria-label="`Duplicate ${obj.name}`"
						@click.stop="duplicate(obj.id)">
						<NcPrintIcon name="layers" :size="13" />
					</button>
					<button
						type="button"
						class="nc-print-scene-list__btn nc-print-scene-list__btn--danger"
						title="Delete"
						:aria-label="`Delete ${obj.name}`"
						:disabled="objects.length <= 1"
						@click.stop="remove(obj.id)">
						<NcPrintIcon name="close" :size="13" />
					</button>
				</span>
			</li>
		</ul>
	</div>
</template>

<style scoped>
.nc-print-scene-list {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.nc-print-scene-list__head {
	color: var(--nc-gcs-text-muted);
	font-size: 11px;
	font-weight: 700;
	letter-spacing: 0.05em;
	text-transform: uppercase;
}

.nc-print-scene-list__ul {
	display: flex;
	flex-direction: column;
	gap: 2px;
	list-style: none;
	margin: 0;
	padding: 0;
}

.nc-print-scene-list__row {
	align-items: center;
	border-radius: 6px;
	cursor: pointer;
	display: flex;
	gap: 8px;
	justify-content: space-between;
	padding: 5px 8px;
}

.nc-print-scene-list__row:hover {
	background: var(--color-background-hover);
}

.nc-print-scene-list__row.is-selected {
	background: var(--color-primary-element-light, var(--color-background-hover));
	outline: 1px solid var(--nc-app-accent, var(--color-primary-element));
}

.nc-print-scene-list__name {
	flex: 1;
	font-size: var(--nc-gcs-text-sm);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.nc-print-scene-list__actions {
	display: flex;
	flex: 0 0 auto;
	gap: 2px;
}

.nc-print-scene-list__btn {
	appearance: none;
	background: none;
	border: none;
	border-radius: 4px;
	color: var(--nc-gcs-text-muted);
	cursor: pointer;
	line-height: 0;
	padding: 4px;
}

.nc-print-scene-list__btn:hover {
	color: var(--color-main-text);
}

.nc-print-scene-list__btn--danger:hover {
	color: var(--color-error, #c33);
}

.nc-print-scene-list__btn:disabled {
	cursor: not-allowed;
	opacity: 0.35;
}
</style>
