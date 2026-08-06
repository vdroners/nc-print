<script>
/**
 * Keypad-style docked box (viewport corner) for the common placement ops the
 * user reaches for constantly: center on bed, rotate 90° per axis, lay flat,
 * scale to fit. Emits the same events the old floating toolbar did so PrepareTab
 * wiring is unchanged.
 */
export default {
	name: 'ViewportOrientPad',
	props: {
		disabled: { type: Boolean, default: false },
		canCenter: { type: Boolean, default: false },
	},
}
</script>

<template>
	<div class="nc-print-orient-pad" role="group" aria-label="Placement">
		<button
			type="button"
			class="nc-print-orient-pad__btn nc-print-orient-pad__ready"
			:disabled="disabled"
			title="Auto-orient, center on bed, and drop to z=0 in one step (undoable)"
			@click="$emit('ready-to-print')">
			★ Ready to print
		</button>
		<button
			type="button"
			class="nc-print-orient-pad__btn nc-print-orient-pad__center"
			:disabled="!canCenter"
			title="Center on bed and drop to z=0"
			@click="$emit('center')">
			⌂ Center
		</button>

		<div class="nc-print-orient-pad__rotrow">
			<button type="button" class="nc-print-orient-pad__btn" :disabled="disabled" title="Rotate 90° around X" @click="$emit('rotate', 'x')">↻ X</button>
			<button type="button" class="nc-print-orient-pad__btn" :disabled="disabled" title="Rotate 90° around Y" @click="$emit('rotate', 'y')">↻ Y</button>
			<button type="button" class="nc-print-orient-pad__btn" :disabled="disabled" title="Rotate 90° around Z" @click="$emit('rotate', 'z')">↻ Z</button>
		</div>

		<button
			type="button"
			class="nc-print-orient-pad__btn nc-print-orient-pad__wide"
			:disabled="disabled"
			title="Place the largest face on the bed"
			@click="$emit('lay-flat')">
			Lay flat
		</button>
		<button
			type="button"
			class="nc-print-orient-pad__btn nc-print-orient-pad__wide"
			:disabled="disabled"
			title="Uniform scale to fit the build volume"
			@click="$emit('scale-to-fit')">
			Scale to fit
		</button>
	</div>
</template>

<style scoped>
.nc-print-orient-pad {
	display: flex;
	flex-direction: column;
	gap: 4px;
	width: 168px;
	padding: 6px;
	border: 1px solid var(--nc-gcs-border);
	border-radius: var(--nc-gcs-radius-md, 12px);
	background: color-mix(in srgb, var(--nc-gcs-bg-surface, var(--color-main-background)) 82%, transparent);
	backdrop-filter: blur(8px);
	box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}

.nc-print-orient-pad__rotrow {
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	gap: 4px;
}

.nc-print-orient-pad__btn {
	appearance: none;
	background: transparent;
	border: 1px solid var(--nc-gcs-border);
	border-radius: var(--nc-gcs-radius-sm);
	color: var(--nc-gcs-text-primary);
	cursor: pointer;
	font-size: var(--nc-gcs-text-sm);
	padding: 6px 8px;
	text-align: center;
}

.nc-print-orient-pad__btn:hover:not(:disabled) {
	background: var(--nc-gcs-bg-hover, rgba(255, 255, 255, 0.08));
	border-color: var(--nc-app-accent);
}

.nc-print-orient-pad__btn:disabled {
	cursor: default;
	opacity: 0.35;
}

.nc-print-orient-pad__center {
	font-weight: 600;
}

.nc-print-orient-pad__ready {
	font-weight: 600;
	border-color: var(--nc-app-accent);
	color: var(--nc-app-accent);
}

</style>
