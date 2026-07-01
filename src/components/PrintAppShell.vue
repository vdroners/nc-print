<script>
/**
 * PrintAppShell — vendored NcGcsAppShell layout for nc_print (standalone).
 * Banner / body / footer with per-app accent and inline bed icon.
 */
const BED_ICON_SVG =
	'<rect x="3" y="14" width="18" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/>'
	+ '<rect x="5" y="16" width="14" height="2" rx="0.4" fill="currentColor" opacity="0.35"/>'
	+ '<path d="M7 14 V9 L12 5 L17 9 V14" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>'
	+ '<circle cx="12" cy="8.5" r="1.2" fill="currentColor" opacity="0.9"/>'

export default {
	name: 'PrintAppShell',
	props: {
		appId: { type: String, default: 'nc_print' },
		title: { type: String, required: true },
		subtitle: { type: String, default: '' },
		accent: { type: String, default: '#22c55e' },
		hideBanner: { type: Boolean, default: false },
	},
	data() {
		return {
			shellThemeClass: '',
			shellThemeAttr: 'dark',
		}
	},
	computed: {
		shellStyle() {
			return this.accent ? { '--nc-app-accent': this.accent } : null
		},
		bannerIconSvg() {
			return this.appId === 'nc_print' ? BED_ICON_SVG : ''
		},
		bannerIconLetter() {
			return (this.title || this.appId || '?').trim().charAt(0).toUpperCase()
		},
	},
	mounted() {
		this._syncShellTheme()
		this._themeObserver = new MutationObserver(() => this._syncShellTheme())
		this._themeObserver.observe(document.body, {
			attributes: true,
			attributeFilter: ['class', 'data-theme'],
		})
	},
	beforeDestroy() {
		this._themeObserver?.disconnect()
	},
	methods: {
		_syncShellTheme() {
			const body = document.body
			const isLight = body.classList.contains('theme--light')
				|| body.getAttribute('data-theme') === 'light'
			this.shellThemeClass = isLight ? 'theme--light' : ''
			this.shellThemeAttr = isLight ? 'light' : 'dark'
		},
	},
}
</script>

<template>
	<div
		class="nc-gcs-app-shell"
		:class="[`nc-gcs-app-shell--${appId}`, shellThemeClass]"
		:data-app-id="appId"
		:data-nc-gcs-theme="shellThemeAttr"
		:data-theme="shellThemeAttr"
		:style="shellStyle">
		<header v-if="!hideBanner" class="nc-gcs-app-shell__banner">
			<span class="nc-gcs-app-shell__banner-icon" aria-hidden="true">
				<slot name="banner-icon">
					<svg
						v-if="bannerIconSvg"
						class="nc-gcs-app-shell__banner-icon-svg"
						viewBox="0 0 24 24"
						width="22"
						height="22"
						aria-hidden="true"
						focusable="false"
						v-html="bannerIconSvg" />
					<template v-else>{{ bannerIconLetter }}</template>
				</slot>
			</span>
			<h1 class="nc-gcs-app-shell__banner-title">{{ title }}</h1>
			<span v-if="subtitle || $slots['banner-extra']" class="nc-gcs-app-shell__banner-subtitle">
				<slot name="banner-extra">{{ subtitle }}</slot>
			</span>
		</header>
		<div class="nc-gcs-app-shell__body">
			<slot />
		</div>
		<footer v-if="$slots.footer" class="nc-gcs-app-shell__footer">
			<slot name="footer" />
		</footer>
	</div>
</template>
