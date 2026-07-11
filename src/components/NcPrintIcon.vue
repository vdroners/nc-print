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
	bell: '<path d="M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3H4a4 4 0 0 0 2-3v-3a7 7 0 0 1 4-6" /><path d="M9 17v1a3 3 0 0 0 6 0v-1" />',
	'bell-off': '<path d="M9 9v-1a3 3 0 0 1 5.106 -2.114" /><path d="M6 8v3a4 4 0 0 1 -2 3h11" /><path d="M15 11v3a4 4 0 0 0 2 3" /><path d="M9 17v1a3 3 0 0 0 6 0v-1" /><path d="M3 3l18 18" />',
	clock: '<path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" /><path d="M12 7v5l3 3" />',
	'chevron-down': '<path d="M6 9l6 6l6 -6" />',
	folder: '<path d="M5 4h4l3 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2" />',
	maximize: '<path d="M4 8v-2a2 2 0 0 1 2 -2h2" /><path d="M4 16v2a2 2 0 0 0 2 2h2" /><path d="M16 4h2a2 2 0 0 1 2 2v2" /><path d="M16 20h2a2 2 0 0 0 2 -2v-2" />',
	close: '<path d="M18 6l-12 12" /><path d="M6 6l12 12" />',
	terminal: '<path d="M5 7l5 5l-5 5" /><path d="M12 19h7" />',
	grid: '<path d="M4 4h6v6h-6z" /><path d="M14 4h6v6h-6z" /><path d="M4 14h6v6h-6z" /><path d="M14 14h6v6h-6z" />',
	spool: '<path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" /><path d="M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" /><path d="M12 3v3" /><path d="M12 18v3" />',
	video: '<path d="M15 10l4.553 -2.276a1 1 0 0 1 1.447 .894v6.764a1 1 0 0 1 -1.447 .894l-4.553 -2.276v-4z" /><path d="M3 6m0 2a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2z" />',
	list: '<path d="M9 6h11" /><path d="M9 12h11" /><path d="M9 18h11" /><path d="M5 6v.01" /><path d="M5 12v.01" /><path d="M5 18v.01" />',
	download: '<path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" /><path d="M7 11l5 5l5 -5" /><path d="M12 4v12" />',
	move: '<path d="M18 9l3 3l-3 3" /><path d="M15 12h6" /><path d="M6 9l-3 3l3 3" /><path d="M3 12h6" /><path d="M9 18l3 3l3 -3" /><path d="M12 15v6" /><path d="M9 6l3 -3l3 3" /><path d="M12 3v6" />',
	rotate: '<path d="M4.05 11a8 8 0 1 1 .5 4m-.5 5v-5h5" />',
	scale: '<path d="M16 4l4 0l0 4" /><path d="M14 10l6 -6" /><path d="M8 20l-4 0l0 -4" /><path d="M4 20l6 -6" /><path d="M16 20l4 0l0 -4" /><path d="M14 14l6 6" /><path d="M8 4l-4 0l0 4" /><path d="M4 4l6 6" />',
	mirror: '<path d="M12 3l0 18" /><path d="M16 7l0 10l4 0z" /><path d="M8 7l0 10l-4 0z" />',
	cut: '<path d="M6 8m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M6 16m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M8.6 8.6l10.4 10.4" /><path d="M8.6 15.4l10.4 -10.4" />',
	eye: '<path d="M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" /><path d="M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6" />',
	target: '<path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" /><path d="M12 12m-5 0a5 5 0 1 0 10 0a5 5 0 1 0 -10 0" /><path d="M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />',
	refresh: '<path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" /><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" />',
	pin: '<path d="M9 4v6l-2 4v2h10v-2l-2 -4v-6" /><path d="M12 16l0 5" /><path d="M8 4l8 0" />',
	search: '<path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" /><path d="M21 21l-6 -6" />',
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
