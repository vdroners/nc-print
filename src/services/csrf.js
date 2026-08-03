/**
 * CSRF requesttoken for raw fetch() calls.
 * Prefer @nextcloud/axios for JSON APIs — it sends the token automatically.
 * @returns {string}
 */
export function csrfRequestToken() {
	try {
		// eslint-disable-next-line no-undef
		if (typeof OC !== 'undefined' && OC.requestToken) {
			return OC.requestToken
		}
	} catch {
		/* ignore */
	}
	if (typeof document !== 'undefined') {
		const meta = document.querySelector('head > meta[name="requesttoken"]')
		if (meta?.getAttribute('content')) {
			return meta.getAttribute('content')
		}
	}
	return ''
}
