(function () {
	const root = document.getElementById('nc-print-admin-settings')
	const form = document.getElementById('nc-print-admin-form')
	const status = document.getElementById('nc-print-admin-status')
	if (!root || !form) {
		return
	}
	const saveUrl = root.dataset.saveUrl
	form.addEventListener('submit', async (e) => {
		e.preventDefault()
		if (!saveUrl) {
			return
		}
		const fd = new FormData(form)
		const body = {}
		for (const [key, val] of fd.entries()) {
			body[key] = val
		}
		for (const el of form.querySelectorAll('input[type=checkbox]')) {
			if (el.name) {
				body[el.name] = el.checked ? 'yes' : 'no'
			}
		}
		if (status) {
			status.textContent = 'Saving…'
		}
		try {
			const res = await fetch(saveUrl, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json', requesttoken: OC.requestToken },
				body: JSON.stringify(body),
			})
			if (!res.ok) {
				throw new Error('HTTP ' + res.status)
			}
			if (status) {
				status.textContent = 'Saved.'
			}
		} catch (err) {
			if (status) {
				status.textContent = 'Save failed: ' + (err.message || err)
			}
		}
	})
})()
