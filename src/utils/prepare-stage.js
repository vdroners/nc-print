/**
 * Pixel height for the Prepare/Slice immersive studio.
 *
 * The studio used to be `100dvh` minus only the workflow bar. That is ~100px
 * taller than the shell body (Nextcloud header + app banner + footer + body
 * padding), so the page scrolled the whole card while the left panel scrolled
 * inside it. Measure the shell instead: banner, footer, body padding, and the
 * sticky workflow bar are already outside the studio.
 *
 * @param {object} box
 * @param {number} [box.shellHeight]
 * @param {number} [box.bannerHeight]
 * @param {number} [box.footerHeight]
 * @param {number} [box.chromeHeight]
 * @param {number} [box.padTop]
 * @param {number} [box.padBottom]
 * @param {number} [box.chromeMarginTop]
 * @param {number} [box.chromeMarginBottom]
 * @returns {number} stage height in CSS pixels, never negative
 */
export function prepareStageHeight({
	shellHeight = 0,
	bannerHeight = 0,
	footerHeight = 0,
	chromeHeight = 0,
	padTop = 0,
	padBottom = 0,
	chromeMarginTop = 0,
	chromeMarginBottom = 0,
} = {}) {
	const raw = shellHeight
		- bannerHeight
		- footerHeight
		- padTop
		- padBottom
		- chromeHeight
		- chromeMarginTop
		- chromeMarginBottom
	if (!Number.isFinite(raw)) {
		return 0
	}
	return Math.max(0, Math.floor(raw))
}
