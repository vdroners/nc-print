<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { fuzzyFilter } from '@/utils/fuzzy.js'
import { buildCommands } from '@/utils/commands.js'
import NcPrintIcon from './NcPrintIcon.vue'

/**
 * Ctrl/Cmd+K command palette — fuzzy "jump to anything" over navigation,
 * actions, Print panels, and printers (3DPrintForge parity). Opened via the
 * `open` prop (.sync); the parent owns the shortcut + the import/focus
 * callbacks. Fully keyboard-driven: type to filter, ↑/↓ to move, Enter to run,
 * Esc / click-out to close.
 */
export default {
	name: 'CommandPalette',
	components: { NcPrintIcon },
	props: {
		open: { type: Boolean, default: false },
		/** Called by the "Import model…" command (parent runs the file picker). */
		openImport: { type: Function, default: null },
		/** Called with a panel id to jump to + expand a Print panel. */
		focusPanel: { type: Function, default: null },
	},
	data() {
		return {
			query: '',
			cursor: 0,
		}
	},
	computed: {
		...mapStores(usePrintStore),
		commands() {
			return buildCommands(this.printStore, {
				openImport: this.openImport ? () => this.openImport() : undefined,
				focusPanel: this.focusPanel ? (id) => this.focusPanel(id) : undefined,
			})
		},
		results() {
			// Rank enabled matches first, but keep disabled matches visible below.
			const matched = fuzzyFilter(this.query, this.commands, (c) => `${c.title} ${c.group}`)
			return matched.slice(0, 40)
		},
		grouped() {
			const groups = []
			const byGroup = new Map()
			for (const c of this.results) {
				if (!byGroup.has(c.group)) {
					byGroup.set(c.group, [])
					groups.push(c.group)
				}
				byGroup.get(c.group).push(c)
			}
			return groups.map((g) => ({ group: g, items: byGroup.get(g) }))
		},
		/** Flat, in-display-order list — the cursor indexes into this. */
		flat() {
			return this.grouped.flatMap((g) => g.items)
		},
	},
	watch: {
		open(now) {
			if (now) {
				this.query = ''
				this.cursor = 0
				this.$nextTick(() => this.$refs.input?.focus())
			}
		},
		query() {
			this.cursor = 0
		},
	},
	methods: {
		close() {
			this.$emit('update:open', false)
		},
		move(delta) {
			const n = this.flat.length
			if (n === 0) {
				return
			}
			this.cursor = (this.cursor + delta + n) % n
			this.$nextTick(() => {
				const el = this.$refs[`opt-${this.cursor}`]
				const node = Array.isArray(el) ? el[0] : el
				node?.scrollIntoView?.({ block: 'nearest' })
			})
		},
		runAt(i) {
			const cmd = this.flat[i]
			if (!cmd || !cmd.enabled) {
				return
			}
			this.close()
			try {
				const r = cmd.run()
				if (r && typeof r.then === 'function') {
					r.catch(() => { /* store toasts its own errors */ })
				}
			} catch {
				// swallow — commands are best-effort
			}
		},
		onKeydown(e) {
			if (e.key === 'ArrowDown') {
				e.preventDefault()
				this.move(1)
			} else if (e.key === 'ArrowUp') {
				e.preventDefault()
				this.move(-1)
			} else if (e.key === 'Enter') {
				e.preventDefault()
				this.runAt(this.cursor)
			} else if (e.key === 'Escape') {
				e.preventDefault()
				this.close()
			}
		},
		indexOf(cmd) {
			return this.flat.indexOf(cmd)
		},
	},
}
</script>

<template>
	<teleport to="body">
		<div
			v-if="open"
			class="nc-print-cmdk-backdrop"
			@click.self="close">
			<div class="nc-print-cmdk" role="dialog" aria-modal="true" aria-label="Command palette">
				<div class="nc-print-cmdk__search">
					<NcPrintIcon name="search" :size="16" />
					<input
						ref="input"
						v-model="query"
						type="text"
						class="nc-print-cmdk__input"
						placeholder="Type a command… (Esc to close)"
						aria-label="Search commands"
						@keydown="onKeydown">
				</div>
				<div class="nc-print-cmdk__list" role="listbox">
					<template v-for="grp in grouped">
						<div :key="'h-' + grp.group" class="nc-print-cmdk__group">{{ grp.group }}</div>
						<button
							v-for="cmd in grp.items"
							:key="cmd.id"
							:ref="`opt-${indexOf(cmd)}`"
							type="button"
							class="nc-print-cmdk__item"
							:class="{
								'is-active': indexOf(cmd) === cursor,
								'is-disabled': !cmd.enabled,
							}"
							role="option"
							:aria-selected="indexOf(cmd) === cursor ? 'true' : 'false'"
							:disabled="!cmd.enabled"
							@mousemove="cursor = indexOf(cmd)"
							@click="runAt(indexOf(cmd))">
							<span class="nc-print-cmdk__title">{{ cmd.title }}</span>
							<span v-if="cmd.hint" class="nc-print-cmdk__hint">{{ cmd.hint }}</span>
						</button>
					</template>
					<p v-if="!flat.length" class="nc-print-cmdk__empty">No matching commands</p>
				</div>
				<div class="nc-print-cmdk__footer">
					<span>↑↓ navigate</span><span>↵ run</span><span>esc close</span>
				</div>
			</div>
		</div>
	</teleport>
</template>

<style scoped>
.nc-print-cmdk-backdrop {
	align-items: flex-start;
	background: rgba(0, 0, 0, 0.45);
	display: flex;
	inset: 0;
	justify-content: center;
	padding-top: 12vh;
	position: fixed;
	z-index: 3000;
}

.nc-print-cmdk {
	background: var(--nc-gcs-surface, var(--color-main-background));
	border: 1px solid var(--nc-gcs-border);
	border-radius: 12px;
	box-shadow: 0 12px 48px rgba(0, 0, 0, 0.4);
	display: flex;
	flex-direction: column;
	max-height: 60vh;
	max-width: 560px;
	overflow: hidden;
	width: 92%;
}

.nc-print-cmdk__search {
	align-items: center;
	border-bottom: 1px solid var(--nc-gcs-border);
	display: flex;
	gap: 8px;
	padding: 12px 14px;
}

.nc-print-cmdk__input {
	background: none;
	border: none;
	color: var(--color-main-text);
	flex: 1;
	font-size: 1rem;
	outline: none;
}

.nc-print-cmdk__list {
	overflow-y: auto;
	padding: 6px;
}

.nc-print-cmdk__group {
	color: var(--nc-gcs-text-muted);
	font-size: 10px;
	font-weight: 700;
	letter-spacing: 0.08em;
	padding: 8px 8px 4px;
	text-transform: uppercase;
}

.nc-print-cmdk__item {
	align-items: center;
	appearance: none;
	background: none;
	border: none;
	border-radius: 8px;
	color: var(--color-main-text);
	cursor: pointer;
	display: flex;
	gap: 8px;
	justify-content: space-between;
	padding: 8px 10px;
	text-align: left;
	width: 100%;
}

.nc-print-cmdk__item.is-active {
	background: var(--color-primary-element-light, var(--color-background-hover));
}

.nc-print-cmdk__item.is-disabled {
	cursor: not-allowed;
	opacity: 0.4;
}

.nc-print-cmdk__title {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.nc-print-cmdk__hint {
	color: var(--nc-gcs-text-muted);
	flex: 0 0 auto;
	font-size: 12px;
}

.nc-print-cmdk__empty {
	color: var(--nc-gcs-text-muted);
	padding: 16px;
	text-align: center;
}

.nc-print-cmdk__footer {
	border-top: 1px solid var(--nc-gcs-border);
	color: var(--nc-gcs-text-muted);
	display: flex;
	font-size: 11px;
	gap: 16px;
	justify-content: center;
	padding: 8px;
}
</style>
