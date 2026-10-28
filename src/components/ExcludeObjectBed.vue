<script>
let hatchSeq = 0

/**
 * Presentational top-down bed. Highlight and selection are owned by
 * QueuePanel so the plate and the name list stay on the same object.
 * This component never excludes an object — Cancel stays on the list.
 */
export default {
	name: 'ExcludeObjectBed',
	props: {
		model: { type: Object, required: true },
		highlighted: { type: String, default: '' },
		selected: { type: String, default: '' },
	},
	data() {
		return {
			hatchId: `nc-print-bed-hatch-${hatchSeq++}`,
		}
	},
	computed: {
		hatchFill() {
			return `url(#${this.hatchId})`
		},
		unplacedNote() {
			const n = this.model.unplaced?.length || 0
			if (!n) {
				return ''
			}
			return n === 1
				? '1 object has no bed position from the printer.'
				: `${n} objects have no bed position from the printer.`
		},
	},
	methods: {
		labelFor(shape) {
			const state = shape.status === 'printing'
				? 'printing now'
				: shape.status === 'excluded'
					? 'excluded'
					: 'waiting'
			return `${shape.glyph}, ${state}. ${shape.name}. Highlights the matching row. Does not cancel.`
		},
		onEnter(name) {
			this.$emit('highlight', name)
		},
		onLeave() {
			this.$emit('highlight', '')
		},
	},
}
</script>

<template>
	<div class="nc-print-bed">
		<svg
			class="nc-print-bed__svg"
			:viewBox="model.viewBox"
			role="group"
			:aria-label="model.ariaLabel">
			<defs>
				<pattern
					:id="hatchId"
					width="5"
					height="5"
					patternUnits="userSpaceOnUse"
					patternTransform="rotate(40)">
					<line x1="0" y1="0" x2="0" y2="5" stroke="currentColor" stroke-width="1.4" />
				</pattern>
			</defs>
			<rect
				class="nc-print-bed__plate"
				:x="model.plate.x"
				:y="model.plate.y"
				:width="model.plate.width"
				:height="model.plate.height"
				rx="2" />
			<line
				class="nc-print-bed__guide"
				:x1="model.guides.x"
				:y1="model.guides.top"
				:x2="model.guides.x"
				:y2="model.guides.bottom" />
			<line
				class="nc-print-bed__guide"
				:x1="model.guides.left"
				:y1="model.guides.y"
				:x2="model.guides.right"
				:y2="model.guides.y" />
			<g
				v-for="shape in model.placed"
				:key="shape.marker + shape.name"
				class="nc-print-bed__obj"
				:class="[`is-${shape.status}`, { 'is-hot': highlighted === shape.name }]"
				role="button"
				tabindex="0"
				:aria-label="labelFor(shape)"
				:aria-pressed="selected === shape.name ? 'true' : 'false'"
				@mouseenter="onEnter(shape.name)"
				@mouseleave="onLeave"
				@focus="onEnter(shape.name)"
				@blur="onLeave"
				@click="$emit('select', shape.name)"
				@keydown.enter.prevent="$emit('select', shape.name)"
				@keydown.space.prevent="$emit('select', shape.name)">
				<title>{{ shape.name }}</title>
				<polygon
					v-if="shape.points"
					class="nc-print-bed__fill"
					:points="shape.points" />
				<circle
					v-else
					class="nc-print-bed__fill"
					:cx="shape.cx"
					:cy="shape.cy"
					:r="shape.r" />
				<polygon
					v-if="shape.points && shape.status === 'excluded'"
					class="nc-print-bed__hatch"
					:points="shape.points"
					:fill="hatchFill" />
				<circle
					v-else-if="shape.status === 'excluded'"
					class="nc-print-bed__hatch"
					:cx="shape.cx"
					:cy="shape.cy"
					:r="shape.r"
					:fill="hatchFill" />
				<text
					class="nc-print-bed__glyph"
					:x="shape.cx"
					:y="shape.cy"
					:font-size="shape.fontSize"
					text-anchor="middle"
					dominant-baseline="central">{{ shape.glyph }}</text>
			</g>
			<text
				class="nc-print-bed__caption"
				:x="model.leftLabel.x"
				:y="model.leftLabel.y"
				font-size="13"
				text-anchor="start">left</text>
			<text
				class="nc-print-bed__caption"
				:x="model.front.x"
				:y="model.front.y"
				font-size="13"
				text-anchor="middle">front</text>
			<text
				class="nc-print-bed__caption"
				:x="model.rightLabel.x"
				:y="model.rightLabel.y"
				font-size="13"
				text-anchor="end">right</text>
		</svg>
		<ul class="nc-print-bed__legend">
			<li><span class="nc-print-bed__swatch is-printing" /> Printing</li>
			<li><span class="nc-print-bed__swatch is-waiting" /> Waiting</li>
			<li><span class="nc-print-bed__swatch is-excluded" /> Excluded</li>
		</ul>
		<p class="nc-print-bed__meta">{{ model.bedWidth }}×{{ model.bedDepth }} mm · front at the bottom</p>
		<p v-if="unplacedNote" class="nc-print-bed__meta">{{ unplacedNote }}</p>
	</div>
</template>

<style scoped>
.nc-print-bed__svg {
	background: var(--nc-gcs-bg-app);
	border: 1px solid var(--nc-gcs-border);
	border-radius: var(--nc-gcs-radius);
	display: block;
	height: auto;
	width: 100%;
}

.nc-print-bed__plate {
	fill: var(--nc-gcs-bg-surface);
	stroke: var(--nc-gcs-border-strong);
	stroke-width: 1.5;
}

.nc-print-bed__guide {
	stroke: var(--nc-gcs-border);
	stroke-width: 0.6;
}

.nc-print-bed__obj {
	cursor: pointer;
	color: var(--nc-gcs-text-muted);
}

.nc-print-bed__obj:focus {
	outline: none;
}

.nc-print-bed__obj:focus-visible .nc-print-bed__fill {
	stroke: var(--nc-gcs-primary);
	stroke-width: 2.5;
}

.nc-print-bed__fill {
	stroke-width: 1.25;
}

.nc-print-bed__obj.is-waiting .nc-print-bed__fill {
	fill: color-mix(in srgb, var(--nc-gcs-primary) 28%, var(--nc-gcs-bg-elevated));
	stroke: var(--nc-gcs-border-strong);
}

.nc-print-bed__obj.is-printing .nc-print-bed__fill {
	fill: color-mix(in srgb, var(--nc-gcs-accent) 50%, var(--nc-gcs-bg-elevated));
	stroke: var(--nc-gcs-accent);
	stroke-width: 1.8;
}

.nc-print-bed__obj.is-excluded .nc-print-bed__fill {
	fill: color-mix(in srgb, var(--nc-gcs-text-muted) 22%, var(--nc-gcs-bg-app));
	stroke: var(--nc-gcs-text-muted);
	stroke-dasharray: 3 2;
}

.nc-print-bed__hatch {
	pointer-events: none;
	stroke: none;
}

.nc-print-bed__obj.is-hot .nc-print-bed__fill {
	stroke: var(--nc-gcs-accent);
	stroke-dasharray: none;
	stroke-width: 2.75;
}

.nc-print-bed__glyph {
	fill: var(--nc-gcs-text-primary);
	font-family: var(--nc-gcs-font-sans, sans-serif);
	font-weight: 700;
	pointer-events: none;
}

.nc-print-bed__obj.is-excluded .nc-print-bed__glyph {
	fill: var(--nc-gcs-text-secondary);
}

.nc-print-bed__caption {
	fill: var(--nc-gcs-text-muted);
	font-family: var(--nc-gcs-font-sans, sans-serif);
	font-weight: 600;
}

.nc-print-bed__legend {
	display: flex;
	flex-wrap: wrap;
	gap: 10px 12px;
	list-style: none;
	margin: 8px 0 0;
	padding: 0;
}

.nc-print-bed__legend li {
	align-items: center;
	color: var(--nc-gcs-text-secondary);
	display: flex;
	font-size: 11px;
	gap: 6px;
}

.nc-print-bed__swatch {
	border-radius: 2px;
	display: inline-block;
	height: 10px;
	width: 14px;
}

.nc-print-bed__swatch.is-printing {
	background: color-mix(in srgb, var(--nc-gcs-accent) 55%, var(--nc-gcs-bg-elevated));
	box-shadow: inset 0 0 0 1px var(--nc-gcs-accent);
}

.nc-print-bed__swatch.is-waiting {
	background: color-mix(in srgb, var(--nc-gcs-primary) 35%, var(--nc-gcs-bg-elevated));
	box-shadow: inset 0 0 0 1px var(--nc-gcs-border-strong);
}

.nc-print-bed__swatch.is-excluded {
	background: repeating-linear-gradient(
		-40deg,
		transparent,
		transparent 2px,
		var(--nc-gcs-text-muted) 2px,
		var(--nc-gcs-text-muted) 3px
	);
	box-shadow: inset 0 0 0 1px var(--nc-gcs-text-muted);
}

.nc-print-bed__meta {
	color: var(--nc-gcs-text-muted);
	font-size: 11px;
	margin: 4px 0 0;
}
</style>
