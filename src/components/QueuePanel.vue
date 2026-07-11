<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { moonrakerGet, moonrakerProxyPost, excludeObject } from '@/services/moonraker-api.js'
import { toastError, toastSuccess } from '@/services/toast.js'
import { parseJobQueue, reorderQueueIds, parseExcludeObjects } from '@/utils/queue.js'
import { panelVisibility } from '@/mixins/panelVisibility.js'

export default {
	name: 'QueuePanel',
	mixins: [panelVisibility],
	data() {
		return {
			queue: { state: 'ready', jobs: [] },
			exclude: { objects: [], currentObject: null, excludedCount: 0 },
			loadError: '',
			busy: false,
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
	},
	watch: {
		connected(now) {
			if (now) {
				void this.load()
			}
		},
	},
	mounted() {
		if (this.connected) {
			void this.load()
		}
	},
	methods: {
		async load() {
			try {
				if (this.queueSupported) {
					const q = await moonrakerGet('server/job_queue/status', {}, this.printerId)
					this.queue = parseJobQueue(q)
				}
				const eo = await moonrakerGet('printer/objects/query', { exclude_object: '' }, this.printerId)
				this.exclude = parseExcludeObjects(eo)
				this.loadError = ''
			} catch (e) {
				this.loadError = e?.message || 'Queue unavailable'
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
			<ul class="nc-print-queue__list">
				<li v-for="obj in exclude.objects" :key="obj.name" class="nc-print-queue__item">
					<span class="nc-print-queue__name" :class="{ 'nc-print-queue__name--excluded': obj.excluded }">
						{{ obj.name }}
						<span v-if="obj.name === exclude.currentObject" class="nc-print-badge nc-print-badge--info">printing</span>
					</span>
					<button
						type="button"
						class="nc-print-btn nc-print-btn--sm nc-print-btn--danger"
						:disabled="obj.excluded || busy || !printing"
						@click="onExclude(obj.name)">
						{{ obj.excluded ? 'Excluded' : 'Cancel object' }}
					</button>
				</li>
			</ul>
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
	font-size: var(--nc-gcs-text-sm);
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
</style>
