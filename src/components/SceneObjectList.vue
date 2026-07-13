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
	data() {
		return {
			menu: { open: false, id: null, x: 0, y: 0 },
		}
	},
	mounted() {
		this._closeMenu = () => { this.menu.open = false }
		window.addEventListener('click', this._closeMenu)
		window.addEventListener('scroll', this._closeMenu, true)
	},
	beforeDestroy() {
		window.removeEventListener('click', this._closeMenu)
		window.removeEventListener('scroll', this._closeMenu, true)
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
		openMenu(e, id) {
			this.select(id)
			this.menu = { open: true, id, x: e.clientX, y: e.clientY }
		},
		menuAction(action) {
			const id = this.menu.id
			this.menu.open = false
			if (!id) {
				return
			}
			if (action === 'select') {
				this.select(id)
			} else if (action === 'duplicate') {
				this.duplicate(id)
			} else if (action === 'delete') {
				if (this.objects.length > 1) {
					this.remove(id)
				}
			} else if (action === 'center') {
				this.select(id)
				this.$emit('center', id)
			} else if (action === 'rename') {
				const obj = this.objects.find((o) => o.id === id)
				const name = window.prompt('Rename object', obj?.name || '')
				if (name && name.trim()) {
					this.printStore.renameObject(id, name.trim())
				}
			}
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
				@click="select(obj.id)"
				@contextmenu.prevent="openMenu($event, obj.id)">
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

		<!-- Right-click context menu (fixed-positioned at the cursor). -->
		<ul
			v-if="menu.open"
			class="nc-print-ctxmenu"
			:style="{ top: menu.y + 'px', left: menu.x + 'px' }"
			@click.stop>
			<li><button type="button" @click="menuAction('select')">Select</button></li>
			<li><button type="button" @click="menuAction('duplicate')">Duplicate</button></li>
			<li><button type="button" @click="menuAction('center')">Center on bed</button></li>
			<li><button type="button" @click="menuAction('rename')">Rename…</button></li>
			<li>
				<button type="button" class="nc-print-ctxmenu__danger" :disabled="objects.length <= 1" @click="menuAction('delete')">Delete</button>
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

.nc-print-ctxmenu {
	position: fixed;
	z-index: 50;
	min-width: 150px;
	margin: 0;
	padding: 4px;
	list-style: none;
	border: 1px solid var(--nc-gcs-border);
	border-radius: var(--nc-gcs-radius-sm);
	background: var(--nc-gcs-bg-elevated, var(--color-main-background));
	box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
}
.nc-print-ctxmenu button {
	appearance: none;
	background: none;
	border: none;
	border-radius: 4px;
	color: var(--nc-gcs-text-primary);
	cursor: pointer;
	display: block;
	font: inherit;
	font-size: var(--nc-gcs-text-sm);
	padding: 6px 10px;
	text-align: left;
	width: 100%;
}
.nc-print-ctxmenu button:hover {
	background: var(--color-background-hover);
}
.nc-print-ctxmenu__danger {
	color: var(--color-error, #c33);
}
.nc-print-ctxmenu button:disabled {
	cursor: not-allowed;
	opacity: 0.4;
}
</style>
