let _dialogsPromise = null

function _loadDialogs() {
	if (_dialogsPromise) {
		return _dialogsPromise
	}
	_dialogsPromise = (async () => {
		await import(/* webpackChunkName: "nc-print-dialogs" */ '@nextcloud/dialogs/style.css')
		return import(/* webpackChunkName: "nc-print-dialogs" */ '@nextcloud/dialogs')
	})()
	return _dialogsPromise
}

async function showError(message, opts) {
	const m = await _loadDialogs()
	return m.showError(message, opts)
}

async function showSuccess(message, opts) {
	const m = await _loadDialogs()
	return m.showSuccess(message, opts)
}

async function showWarning(message, opts) {
	const m = await _loadDialogs()
	return m.showWarning(message, opts)
}

async function showInfo(message, opts) {
	const m = await _loadDialogs()
	return m.showInfo(message, opts)
}

const _recentToasts = new Map()
const _TOAST_DEDUP_MS = 3000

function _isDuplicate(key) {
	const now = Date.now()
	if (_recentToasts.has(key) && now - _recentToasts.get(key) < _TOAST_DEDUP_MS) {
		return true
	}
	_recentToasts.set(key, now)
	return false
}

function _stripHtml(str) {
	return String(str).replace(/<[^>]*>/g, '')
}

export function toastError(message, err) {
	const data = err?.response?.data
	const detail = _stripHtml(
		data?.error ||
		data?.message ||
		(typeof data?.detail === 'string' ? data.detail : '') ||
		err?.message ||
		'',
	)
	const full = detail ? `${message}: ${detail}` : message
	console.error(full, err)
	if (_isDuplicate(`error:${full}`)) {
		return
	}
	showError(full, { timeout: 7000 })
}

export function toastSuccess(message) {
	if (_isDuplicate(`success:${message}`)) {
		return
	}
	showSuccess(message, { timeout: 4000 })
}

export function toastWarning(message) {
	if (_isDuplicate(`warning:${message}`)) {
		return
	}
	showWarning(message, { timeout: 5000 })
}

export function toastInfo(message) {
	if (_isDuplicate(`info:${message}`)) {
		return
	}
	showInfo(message, { timeout: 4000 })
}
