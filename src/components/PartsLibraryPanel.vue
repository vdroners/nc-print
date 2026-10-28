<script>
import { listLibrary, fetchLibraryFile } from '@/services/library-api.js'
import { usePrintStore } from '@/store/print.js'
import { TABS } from '@/constants/tabs.js'

/**
 * Browse the shared host parts library (/media/4TB/3dprints) and open models
 * into Prepare. Forge port Wave 4.
 */
export default {
	name: 'PartsLibraryPanel',
	data() {
		return {
			entries: [],
			subdir: '',
			q: '',
			loading: false,
			error: '',
			total: 0,
		}
	},
	computed: {
		crumbs() {
			if (!this.subdir) return []
			const parts = this.subdir.split('/').filter(Boolean)
			const out = []
			let acc = ''
			for (const p of parts) {
				acc = acc ? `${acc}/${p}` : p
				out.push({ name: p, path: acc })
			}
			return out
		},
	},
	async mounted() {
		await this.reload()
	},
	methods: {
		async reload() {
			this.loading = true
			this.error = ''
			try {
				const data = await listLibrary({ subdir: this.subdir, q: this.q })
				if (!data?.ok) {
					this.error = data?.error || 'Library unavailable'
					this.entries = []
					return
				}
				this.entries = data.entries || []
				this.total = data.total || 0
			} catch (e) {
				this.error = e?.message || 'Could not load library'
				this.entries = []
			} finally {
				this.loading = false
			}
		},
		async go(subdir) {
			this.subdir = subdir || ''
			await this.reload()
		},
		async openEntry(entry) {
			if (entry.dir) {
				await this.go(entry.path)
				return
			}
			if (!entry.model) {
				this.error = 'Only STL / 3MF / OBJ can open into Prepare'
				return
			}
			this.loading = true
			this.error = ''
			try {
				const blob = await fetchLibraryFile(entry.path)
				const file = new File([blob], entry.name, { type: blob.type || 'application/octet-stream' })
				const store = usePrintStore()
				const ok = store.setModel(file, 'library', { library_path: entry.path })
				if (ok) {
					store.activeTab = TABS.PREPARE
				}
			} catch (e) {
				this.error = e?.message || 'Failed to open file'
			} finally {
				this.loading = false
			}
		},
		onSearch() {
			this.reload()
		},
	},
}
</script>

<template>
	<div class="nc-print-library">
		<div class="nc-print-library__toolbar">
			<button type="button" class="nc-print-library__crumb" :disabled="!subdir" @click="go('')">Library root</button>
			<span v-for="c in crumbs" :key="c.path">
				/
				<button type="button" class="nc-print-library__crumb" @click="go(c.path)">{{ c.name }}</button>
			</span>
			<input v-model="q"
				type="search"
				class="nc-print-library__search"
				placeholder="Filter…"
				@keyup.enter="onSearch">
			<button type="button" @click="reload">Refresh</button>
		</div>
		<p v-if="error" class="nc-print-library__error">{{ error }}</p>
		<p v-if="loading" class="nc-print-library__muted">Loading…</p>
		<ul v-else class="nc-print-library__list">
			<li v-for="e in entries" :key="e.path">
				<button type="button" class="nc-print-library__row" @click="openEntry(e)">
					<span class="nc-print-library__icon">{{ e.dir ? '📁' : (e.model ? '🧊' : '📄') }}</span>
					<span class="nc-print-library__name">{{ e.name }}</span>
					<span v-if="!e.dir" class="nc-print-library__meta">{{ Math.round(e.size / 1024) }} KB</span>
				</button>
			</li>
		</ul>
		<p v-if="!loading && !entries.length" class="nc-print-library__muted">No files here.</p>
		<p class="nc-print-library__muted">{{ total }} item(s) · shared parts library</p>
	</div>
</template>

<style scoped>
.nc-print-library__toolbar {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	align-items: center;
	margin-bottom: 12px;
}
.nc-print-library__crumb {
	background: none;
	border: none;
	color: var(--color-primary, #0082c9);
	cursor: pointer;
	padding: 0 2px;
}
.nc-print-library__search {
	flex: 1;
	min-width: 140px;
}
.nc-print-library__list {
	list-style: none;
	margin: 0;
	padding: 0;
}
.nc-print-library__row,
.nc-print-library__row:hover,
.nc-print-library__row:focus,
.nc-print-library__row:active {
	display: flex;
	width: 100%;
	gap: 10px;
	align-items: center;
	padding: 8px 10px;
	border: 1px solid var(--color-border, #ddd);
	border-radius: 6px;
	background: var(--color-main-background, #111);
	/* Nextcloud paints raw buttons with primary-element text (dark green on
	   this theme). Name that color so filenames stay readable on dark rows. */
	color: var(--nc-gcs-text-primary, var(--color-main-text, #e6edf3));
	margin-bottom: 6px;
	cursor: pointer;
	text-align: left;
}
.nc-print-library__name {
	flex: 1;
	font-weight: 600;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	color: inherit;
}
.nc-print-library__meta {
	color: var(--color-text-maxcontrast, #666);
	font-size: 0.8rem;
}
.nc-print-library__error { color: var(--color-error, #e9322d); }
.nc-print-library__muted { color: var(--color-text-maxcontrast, #666); font-size: 0.85rem; }
</style>
