<script>
/** Tabler-style inline SVG glyphs for NC Print (stroke, 24 viewBox). */
const ICONS = {
	printer: '<path d="M17 17h2v2a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-2h2" /><path d="M17 11v-4a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v4" /><path d="M7 13h.01" /><path d="M11 13h2" />',
	cube: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3" /><path d="M12 12l8-4.5" /><path d="M12 12v9" /><path d="M12 12L4 7.5" />',
	layers: '<path d="M8.5 10.5L12 12.5l3.5-2" /><path d="M12 12.5V21" /><path d="M4.5 8.5L12 4.5l7.5 4" /><path d="M4.5 12.5L12 16.5l7.5-4" />',
	thermometer: '<path d="M10 13.5a4 4 0 1 0 4 0V5a2 2 0 0 0-4 0v8.5" /><path d="M10 9h4" />',
	camera: '<path d="M5 7h1a2 2 0 0 0 2-2V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v0a2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2" /><path d="M9 13a3 3 0 1 0 6 0a3 3 0 0 0-6 0" />',
	play: '<path d="M7 4v16l13-8z" />',
	pause: '<path d="M6 5h4v14H6z" /><path d="M14 5h4v14h-4z" />',
	stop: '<path d="M5 5h14v14H5z" />',
	home: '<path d="M5 12l-2 0l9-9l9 9l-2 0" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" /><path d="M9 21v-6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v6" />',
	bolt: '<path d="M13 3l0 7l6 0l-8 11l0-7l-6 0l8-11" />',
	check: '<path d="M5 12l5 5l10-10" />',
	alert: '<path d="M12 9v4" /><path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.875h16.214a1.914 1.914 0 0 0 1.636-2.875L13.637 3.591a1.914 1.914 0 0 0-3.274 0" /><path d="M12 16h.01" />',
	upload: '<path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /><path d="M7 9l5-5l5 5" /><path d="M12 4v12" />',
}

export default {
	name: 'NcPrintIcon',
	props: {
		name: { type: String, required: true },
		size: { type: [Number, String], default: 16 },
	},
	computed: {
		path() {
			return ICONS[this.name] || ''
		},
	},
}
</script>

<template>
	<svg
		v-if="path"
		class="nc-print-icon"
		xmlns="http://www.w3.org/2000/svg"
		:width="size"
		:height="size"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
		focusable="false"
		v-html="path" />
</template>
