<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { moonrakerGet, moonrakerProxyPost, excludeObject } from '@/services/moonraker-api.js'
import { toastError, toastSuccess } from '@/services/toast.js'
import { parseJobQueue, reorderQueueIds, parseExcludeObjects } from '@/utils/queue.js'
import { layoutExcludeBed } from '@/utils/exclude-bed.js'
import { panelVisibility } from '@/mixins/panelVisibility.js'
import ExcludeObjectBed from './ExcludeObjectBed.vue'

/** How often to re-read exclude_object while a job (or its objects) is on screen. */
const EXCLUDE_POLL_MS = 3000

export default {
	name: 'QueuePanel',
	components: { ExcludeObjectBed },
	mixins: [panelVisibility],
	data() {
		return {
			queue: { state: 'ready', jobs: [] },
			exclude: { objects: [], currentObject: null, excludedCount: 0 },
			loadError: '',
			busy: false,
			hoverName: '',
			selectedName: '',
			loadSeq: 0,
		}
	},
	computed: {
		...mapStores(usePrintStore),
		printerId() {
			return this.printStore.selectedPrinterId || undefined
		},
		connected() {
			return this.printStore.printerState.connected
		},
		queueSupported() {
			return this.printStore.hasFeature('job_queue')
		},
		printing() {
			return this.printStore.printerControls.isActive
		},
		hasExcludeObjects() {
			return this.exclude.objects.length > 0
		},
		panelVisible() {
			return this.connected && (this.queueSupported || this.hasExcludeObjects)
		},
		bedModel() {
			const [width, depth] = this.printStore.buildVolume || []
			return layoutExcludeBed(this.exclude.objects, {
				width,
				depth,
				currentObject: this.exclude.currentObject,
			})
		},
		highlightedName() {
			return this.hoverName || this.selectedName
		},
	},
	watch: {
		connected(now) {
			if (now) {
				void this.load()
			}
		},
		printing(now) {
			if (now && this.connected) {
				void this.load()
			}
		},
		'exclude.objects'(list) {
			const names = new Set((list || []).map((obj) => obj.name))
			if (this.selectedName && !names.has(this.selectedName)) {
				this.selectedName = ''
			}
			if (this.hoverName && !names.has(this.hoverName)) {
				this.hoverName = ''
			}
		},
	},
	mounted() {
		if (this.connected) {
			void this.load()
		}
		this._excludeTimer = setInterval(() => {
			if (!this.connected || this.busy) {
				return
			}
			if (this.printing || this.hasExcludeObjects) {
				void this.load()
			}
		}, EXCLUDE_POLL_MS)
	},
	beforeDestroy() {
		clearInterval(this._excludeTimer)
	},
	methods: {
		async load() {
			const seq = ++this.loadSeq
			try {
				if (this.queueSupported) {
					const q = await moonrakerGet('server/job_queue/status', {}, this.printerId)
					if (seq !== this.loadSeq) {
						return
					}
					this.queue = parseJobQueue(q)
				}
				const eo = await moonrakerGet('printer/objects/query', { exclude_object: '' }, this.printerId)
				if (seq !== this.loadSeq) {
					return
				}
				this.exclude = parseExcludeObjects(eo)
				this.loadError = ''
			} catch (e) {
				if (seq !== this.loadSeq) {
					return
				}
				this.loadError = e?.message || 'Queue unavailable'
			}
		},
		toggleSelect(name) {
			this.selectedName = this.selectedName === name ? '' : name
		},
		onHighlight(name) {
			this.hoverName = name || ''
		},
		clearHover(name) {
			if (this.hoverName === name) {
				this.hoverName = ''
			}
		},
		async removeJob(jobId) {
			this.busy = true
			try {
				await moonrakerProxyPost(`server/job_queue/job?job_ids=${encodeURIComponent(jobId)}`, {}, this.printerId)
				await this.load()
			} catch (e) {
				toastError('Could not remove job', e)
			} finally {
				this.busy = false
			}
		},
		move(index, delta) {
			// Optimistic local reorder (Moonraker exposes no reorder endpoint).
			const ids = this.queue.jobs.map(j => j.jobId)
			const next = reorderQueueIds(ids, index, index + delta)
			const byId = new Map(this.queue.jobs.map(j => [j.jobId, j]))
			this.queue = { ...this.queue, jobs: next.map(id => byId.get(id)) }
		},
		async onExclude(name) {
			this.selectedName = name
			if (!window.confirm(`Cancel object "${name}"? The rest of the print continues.`)) {
				return
			}
			this.busy = true
			try {
				await excludeObject(name, this.printerId)
				toastSuccess(`Excluded ${name}`)
				await this.load()
			} catch (e) {
				toastError('Exclude object failed', e)
			} finally {
				this.busy = false
			}
		},
	},
}
</script>

<template>
	<div v-if="panelVisible" class="nc-print-queue">
		<p v-if="loadError" class="nc-print-queue__msg">{{ loadError }}</p>

		<template v-if="queueSupported">
			<p class="nc-print-section-label">Job queue ({{ queue.state }})</p>
			<ul v-if="queue.jobs.length" class="nc-print-queue__list">
				<li v-for="(job, i) in queue.jobs" :key="job.jobId" class="nc-print-queue__item">
					<span class="nc-print-queue__name">{{ job.filename }}</span>
					<span class="nc-print-queue__controls">
						<button type="button" class="nc-print-btn nc-print-btn--sm" :disabled="i === 0 || busy" @click="move(i, -1)">↑</button>
						<button type="button" class="nc-print-btn nc-print-btn--sm" :disabled="i === queue.jobs.length - 1 || busy" @click="move(i, 1)">↓</button>
						<button type="button" class="nc-print-btn nc-print-btn--sm nc-print-btn--danger" :disabled="busy" @click="removeJob(job.jobId)">Remove</button>
					</span>
				</li>
			</ul>
			<p v-else class="nc-print-queue__msg">Queue is empty.</p>
		</template>

		<template v-if="hasExcludeObjects">
			<p class="nc-print-section-label">Objects in this print</p>
			<p class="nc-print-queue__hint">Top-down, front at the bottom. Highlight a part, then use Cancel object.</p>
			<div class="nc-print-objects">
				<div class="nc-print-objects__layout">
				<ExcludeObjectBed
					:model="bedModel"
					:highlighted="highlightedName"
					:selected="selectedName"
					@highlight="onHighlight"
					@select="toggleSelect" />
				<ul class="nc-print-queue__list">
					<li
						v-for="obj in bedModel.items"
						:key="obj.marker + obj.name"
						class="nc-print-queue__item"
						:class="{
							'nc-print-queue__item--hot': highlightedName === obj.name,
							'nc-print-queue__item--printing': obj.status === 'printing',
							'nc-print-queue__item--excluded': obj.status === 'excluded',
						}"
						@mouseenter="onHighlight(obj.name)"
						@mouseleave="clearHover(obj.name)">
						<button
							type="button"
							class="nc-print-queue__pick"
							:aria-pressed="selectedName === obj.name ? 'true' : 'false'"
							:title="obj.name"
							@click="toggleSelect(obj.name)"
							@focus="onHighlight(obj.name)"
							@blur="clearHover(obj.name)">
							<span
								class="nc-print-obj-marker"
								:class="{
									'nc-print-obj-marker--printing': obj.status === 'printing',
									'nc-print-obj-marker--excluded': obj.status === 'excluded',
								}">{{ obj.marker }}</span>
							<span
								class="nc-print-queue__name"
								:class="{ 'nc-print-queue__name--excluded': obj.excluded }"
								:title="obj.name">
								{{ obj.name }}
							</span>
							<span v-if="obj.shortLabel !== obj.marker && obj.shortLabel !== obj.name" class="nc-print-queue__short">{{ obj.shortLabel }}</span>
							<span v-if="obj.status === 'printing'" class="nc-print-badge nc-print-badge--info">printing</span>
						</button>
						<button
							type="button"
							class="nc-print-btn nc-print-btn--sm nc-print-btn--danger nc-print-queue__cancel"
							:disabled="obj.excluded || busy || !printing"
							@click="onExclude(obj.name)">
							{{ obj.excluded ? 'Excluded' : 'Cancel object' }}
						</button>
					</li>
				</ul>
				</div>
			</div>
		</template>
	</div>
</template>

<style scoped>
.nc-print-queue__list {
	list-style: none;
	margin: 0 0 12px;
	padding: 0;
}

.nc-print-queue__item {
	align-items: center;
	border-bottom: 1px solid var(--nc-gcs-border);
	display: flex;
	gap: 8px;
	justify-content: space-between;
	padding: 6px 0;
}

.nc-print-queue__name {
	flex: 1 1 auto;
	font-size: var(--nc-gcs-text-sm);
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.nc-print-queue__name--excluded {
	color: var(--nc-gcs-text-muted);
	text-decoration: line-through;
}

.nc-print-queue__controls {
	display: flex;
	flex-shrink: 0;
	gap: 4px;
}

.nc-print-queue__msg {
	color: var(--nc-gcs-text-muted);
	font-size: var(--nc-gcs-text-sm);
}

.nc-print-queue__hint {
	color: var(--nc-print-text-raised, var(--nc-gcs-text-secondary));
	font-size: var(--nc-gcs-text-sm);
	margin: 0 0 10px;
}

.nc-print-objects {
	container-type: inline-size;
}

.nc-print-objects__layout {
	align-items: start;
	display: grid;
	gap: 12px 16px;
	grid-template-columns: minmax(160px, 260px) minmax(0, 1fr);
}

@container (max-width: 520px) {
	.nc-print-objects__layout {
		grid-template-columns: 1fr;
	}
}

@media (max-width: 720px) {
	.nc-print-objects__layout {
		grid-template-columns: 1fr;
	}
}

.nc-print-queue__item--hot {
	background: color-mix(in srgb, var(--nc-gcs-accent) 14%, transparent);
	border-radius: 6px;
	margin: 0 -6px;
	padding-left: 6px;
	padding-right: 6px;
}

.nc-print-queue__item--printing {
	box-shadow: inset 2px 0 0 var(--nc-gcs-accent);
}

.nc-print-queue__pick {
	align-items: center;
	background: transparent;
	border: 0;
	color: inherit;
	cursor: pointer;
	display: flex;
	flex: 1 1 auto;
	gap: 8px;
	min-width: 0;
	padding: 2px 0;
	text-align: left;
}

.nc-print-queue__pick:focus-visible {
	outline: 2px solid var(--nc-gcs-accent);
	outline-offset: 2px;
}

.nc-print-queue__pick .nc-print-badge {
	flex-shrink: 0;
}

.nc-print-obj-marker {
	align-items: center;
	background: var(--nc-gcs-bg-elevated);
	border: 1px solid var(--nc-gcs-border-strong);
	border-radius: 4px;
	color: var(--nc-gcs-text-primary);
	display: inline-flex;
	flex-shrink: 0;
	font-size: 11px;
	font-weight: 700;
	height: 22px;
	justify-content: center;
	min-width: 22px;
	padding: 0 4px;
}

.nc-print-obj-marker--printing {
	border-color: var(--nc-gcs-accent);
	color: var(--nc-gcs-accent);
}

.nc-print-obj-marker--excluded {
	color: var(--nc-gcs-text-muted);
}

.nc-print-queue__short {
	color: var(--nc-gcs-text-secondary);
	flex-shrink: 0;
	font-size: var(--nc-gcs-text-sm);
}

.nc-print-queue__cancel {
	flex-shrink: 0;
}
</style>
