<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'

/**
 * Small docked box (top-right of the viewport) for undo / redo / reset.
 * Undo is transform-aware AND slice-aware: the store's undoTransform clears the
 * last slice result first, then unwinds move/rotate/scale — so canUndoAny is the
 * gate here (not the transform-only meshCanUndo).
 */
export default {
	name: 'ViewportHistoryBox',
	computed: {
		...mapStores(usePrintStore),
		canUndo() {
			return this.printStore.canUndoAny
		},
		canRedo() {
			return this.printStore.meshCanRedo
		},
		undoTitle() {
			return this.printStore.hasSliceResult
				? 'Undo — clear last slice (then move/rotate/scale)'
				: 'Undo move / rotate / scale (Ctrl+Z)'
		},
	},
	methods: {
		onUndo() {
			this.$emit('undo')
		},
		onRedo() {
			this.$emit('redo')
		},
		onReset() {
			this.$emit('reset-transform')
		},
	},
}
</script>

<template>
	<div class="nc-print-history-box" role="group" aria-label="History">
		<button
			type="button"
			class="nc-print-history-box__btn"
			:disabled="!canUndo"
			:title="undoTitle"
			aria-label="Undo"
			@click="onUndo">
			↶
		</button>
		<button
			type="button"
			class="nc-print-history-box__btn"
			:disabled="!canRedo"
			title="Redo (Ctrl+Shift+Z)"
			aria-label="Redo"
			@click="onRedo">
			↷
		</button>
		<span class="nc-print-history-box__sep" aria-hidden="true" />
		<button
			type="button"
			class="nc-print-history-box__btn"
			title="Reset all transforms"
			aria-label="Reset transforms"
			@click="onReset">
			⟳
		</button>
	</div>
</template>

<style scoped>
.nc-print-history-box {
	align-items: center;
	display: flex;
	gap: 4px;
	padding: 4px;
	border: 1px solid var(--nc-gcs-border);
	border-radius: var(--nc-gcs-radius-md, 12px);
	background: color-mix(in srgb, var(--nc-gcs-bg-surface, var(--color-main-background)) 82%, transparent);
	backdrop-filter: blur(8px);
	box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}

.nc-print-history-box__btn {
	appearance: none;
	background: transparent;
	border: 1px solid transparent;
	border-radius: var(--nc-gcs-radius-sm);
	color: var(--nc-gcs-text-primary);
	cursor: pointer;
	font-size: 18px;
	line-height: 1;
	min-width: 34px;
	padding: 7px 9px;
}

.nc-print-history-box__btn:hover:not(:disabled) {
	background: var(--nc-gcs-bg-hover, rgba(255, 255, 255, 0.08));
	border-color: var(--nc-gcs-border);
}

.nc-print-history-box__btn:disabled {
	cursor: default;
	opacity: 0.35;
}

.nc-print-history-box__sep {
	align-self: stretch;
	width: 1px;
	margin: 2px 2px;
	background: var(--nc-gcs-border);
}
</style>
