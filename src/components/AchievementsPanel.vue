<script>
import { fetchAchievements } from '@/services/achievements-api.js'

/**
 * Per-user achievements grid — earned + in-progress milestones derived from the
 * user's print history. Read-only; loads on mount.
 */
export default {
	name: 'AchievementsPanel',
	data() {
		return {
			achievements: [],
			summary: { earned: 0, total: 0, xp: 0, xp_total: 0 },
			loading: true,
			loadError: '',
		}
	},
	computed: {
		earnedList() {
			return this.achievements.filter(a => a.earned)
		},
		inProgressList() {
			return this.achievements
				.filter(a => !a.earned)
				.sort((a, b) => (b.progress || 0) - (a.progress || 0))
		},
	},
	async mounted() {
		await this.reload()
	},
	methods: {
		async reload() {
			this.loading = true
			this.loadError = ''
			try {
				const data = await fetchAchievements()
				this.achievements = Array.isArray(data.achievements) ? data.achievements : []
				this.summary = data.summary || this.summary
			} catch (e) {
				this.loadError = 'Could not load achievements'
			} finally {
				this.loading = false
			}
		},
		pct(a) {
			return Math.round((a.progress || 0) * 100)
		},
	},
}
</script>

<template>
	<div class="ach">
		<div class="ach__head">
			<h3 class="ach__title">Achievements</h3>
			<span v-if="!loading && !loadError" class="ach__score">
				{{ summary.earned }}/{{ summary.total }} · {{ summary.xp }} XP
			</span>
		</div>

		<p v-if="loadError" class="ach__error">{{ loadError }}</p>
		<p v-else-if="loading" class="ach__hint">Loading achievements…</p>

		<template v-else>
			<p v-if="!achievements.length" class="ach__hint">
				Complete a print to start earning achievements.
			</p>

			<div v-if="earnedList.length" class="ach__section">
				<p class="nc-print-section-label">Earned</p>
				<div class="ach__grid">
					<div v-for="a in earnedList" :key="a.id" class="ach__card ach__card--earned" :title="a.description">
						<span class="ach__icon">{{ a.icon }}</span>
						<span class="ach__name">{{ a.title }}</span>
						<span class="ach__xp">+{{ a.xp }} XP</span>
					</div>
				</div>
			</div>

			<div v-if="inProgressList.length" class="ach__section">
				<p class="nc-print-section-label">In progress</p>
				<div class="ach__grid">
					<div v-for="a in inProgressList" :key="a.id" class="ach__card" :title="a.description">
						<span class="ach__icon ach__icon--muted">{{ a.icon }}</span>
						<span class="ach__name">{{ a.title }}</span>
						<div class="ach__bar" role="progressbar" :aria-valuenow="pct(a)" aria-valuemin="0" aria-valuemax="100">
							<div class="ach__bar-fill" :style="{ width: pct(a) + '%' }" />
						</div>
						<span class="ach__prog">{{ a.current }} / {{ a.target }}</span>
					</div>
				</div>
			</div>
		</template>
	</div>
</template>

<style scoped>
.ach__head {
	align-items: baseline;
	display: flex;
	justify-content: space-between;
	gap: var(--nc-gcs-space-sm);
}
.ach__title {
	font-size: var(--nc-gcs-text-base);
	font-weight: 600;
	margin: 0 0 var(--nc-gcs-space-sm);
}
.ach__score {
	color: var(--nc-app-accent);
	font-size: var(--nc-gcs-text-sm);
	font-weight: 600;
	font-variant-numeric: tabular-nums;
}
.ach__hint {
	color: var(--nc-gcs-text-muted);
	font-size: var(--nc-gcs-text-sm);
	margin: 0;
}
.ach__error {
	color: var(--nc-gcs-danger-soft);
	font-size: var(--nc-gcs-text-sm);
	margin: 0;
}
.ach__section {
	margin-top: var(--nc-gcs-space-md);
}
.ach__grid {
	display: grid;
	gap: var(--nc-gcs-space-sm);
	grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
}
.ach__card {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 4px;
	padding: 10px 8px;
	border: 1px solid var(--nc-gcs-border);
	border-radius: var(--nc-gcs-radius-sm);
	background: var(--nc-gcs-bg-elevated);
	text-align: center;
}
.ach__card--earned {
	border-color: color-mix(in srgb, var(--nc-app-accent) 50%, var(--nc-gcs-border));
	background: color-mix(in srgb, var(--nc-app-accent) 8%, transparent);
}
.ach__icon {
	font-size: 26px;
	line-height: 1;
}
.ach__icon--muted {
	filter: grayscale(1);
	opacity: 0.6;
}
.ach__name {
	font-size: var(--nc-gcs-text-sm);
	font-weight: 600;
}
.ach__xp {
	color: var(--nc-app-accent);
	font-size: 11px;
	font-weight: 600;
}
.ach__prog {
	color: var(--nc-gcs-text-muted);
	font-size: 11px;
	font-variant-numeric: tabular-nums;
}
.ach__bar {
	width: 100%;
	height: 6px;
	border-radius: 3px;
	background: var(--nc-gcs-border);
	overflow: hidden;
}
.ach__bar-fill {
	height: 100%;
	background: var(--nc-app-accent);
}
</style>
