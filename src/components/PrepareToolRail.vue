<script>
import NcPrintIcon from './NcPrintIcon.vue'

const GROUPS = [
	{
		label: 'Transform',
		tools: [
			{ id: 'move', icon: 'move', label: 'Move' },
			{ id: 'rotate', icon: 'rotate', label: 'Rotate' },
			{ id: 'scale', icon: 'scale', label: 'Scale' },
		],
	},
	{
		label: 'Orient',
		tools: [
			{ id: 'face', icon: 'target', label: 'Place on face' },
			{ id: 'mirror', icon: 'mirror', label: 'Mirror' },
		],
	},
	{
		label: 'Modify',
		tools: [
			{ id: 'cut', icon: 'cut', label: 'Plane cut' },
		],
	},
	{
		label: 'View',
		tools: [
			{ id: 'view', icon: 'eye', label: 'View & section' },
		],
	},
]

export default {
	name: 'PrepareToolRail',
	components: { NcPrintIcon },
	props: {
		activeTool: { type: String, default: '' },
		disabled: { type: Boolean, default: false },
	},
	data() {
		return { groups: GROUPS }
	},
	methods: {
		select(id) {
			if (this.disabled) {
				return
			}
			this.$emit('tool-change', this.activeTool === id ? '' : id)
		},
	},
}
</script>

<template>
	<div class="nc-print-tool-rail" role="toolbar" aria-label="Prepare tools">
		<div v-for="group in groups" :key="group.label" class="nc-print-tool-rail__group">
			<span class="nc-print-tool-rail__group-label">{{ group.label }}</span>
			<button
				v-for="tool in group.tools"
				:key="tool.id"
				type="button"
				class="nc-print-tool-rail__btn"
				:class="{ 'nc-print-tool-rail__btn--active': activeTool === tool.id }"
				:disabled="disabled"
				:title="tool.label"
				:aria-pressed="activeTool === tool.id"
				@click="select(tool.id)">
				<NcPrintIcon :name="tool.icon" :size="20" />
				<span class="nc-print-tool-rail__btn-label">{{ tool.label }}</span>
			</button>
		</div>
	</div>
</template>

<style scoped>
.nc-print-tool-rail {
	background: color-mix(in srgb, var(--nc-gcs-bg-elevated, #1b2027) 88%, transparent);
	border: 1px solid var(--nc-gcs-border);
	border-radius: var(--nc-gcs-radius-md, 8px);
	display: flex;
	flex-direction: column;
	gap: 6px;
	left: 8px;
	padding: 6px;
	position: absolute;
	top: 8px;
	z-index: 4;
	backdrop-filter: blur(4px);
}

.nc-print-tool-rail__group {
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.nc-print-tool-rail__group + .nc-print-tool-rail__group {
	border-top: 1px solid var(--nc-gcs-border);
	margin-top: 2px;
	padding-top: 4px;
}

.nc-print-tool-rail__group-label {
	color: var(--nc-gcs-text-muted);
	font-size: 9px;
	letter-spacing: 0.05em;
	padding: 0 4px;
	text-transform: uppercase;
}

.nc-print-tool-rail__btn {
	align-items: center;
	appearance: none;
	background: none;
	border: 1px solid transparent;
	border-radius: var(--nc-gcs-radius-sm, 6px);
	color: var(--nc-gcs-text-secondary);
	cursor: pointer;
	display: flex;
	gap: 8px;
	padding: 6px 8px;
	text-align: left;
	transition: background 0.12s ease, color 0.12s ease;
	width: 100%;
}

.nc-print-tool-rail__btn:hover:not(:disabled) {
	background: color-mix(in srgb, var(--nc-app-accent) 14%, transparent);
	color: var(--nc-gcs-text-primary);
}

.nc-print-tool-rail__btn--active {
	background: color-mix(in srgb, var(--nc-app-accent) 24%, transparent);
	border-color: color-mix(in srgb, var(--nc-app-accent) 55%, var(--nc-gcs-border));
	color: var(--nc-app-accent);
}

.nc-print-tool-rail__btn:disabled {
	cursor: not-allowed;
	opacity: 0.4;
}

.nc-print-tool-rail__btn-label {
	font-size: 12px;
	font-weight: 500;
	white-space: nowrap;
}

@media (max-width: 900px) {
	.nc-print-tool-rail__btn-label {
		display: none;
	}
}
</style>
