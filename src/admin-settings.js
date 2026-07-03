(function () {
	const root = document.getElementById('nc-print-admin-settings')
	const form = document.getElementById('nc-print-admin-form')
	const status = document.getElementById('nc-print-admin-status')
	if (!root || !form) {
		return
	}
	const saveUrl = root.dataset.saveUrl
	const discoverUrl = root.dataset.discoverUrl

	// ── Printer autodetect ────────────────────────────────────────────
	const discoverBtn = document.getElementById('nc-print-discover-btn')
	const discoverStatus = document.getElementById('nc-print-discover-status')
	const discoverResults = document.getElementById('nc-print-discover-results')
	const multiField = form.querySelector('[name="multi_printers"]')

	function slugify(s) {
		return String(s || 'printer').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'printer'
	}

	function addPrinterToConfig(p) {
		let arr = []
		try {
			arr = JSON.parse(multiField.value || '[]')
			if (!Array.isArray(arr)) {
				arr = []
			}
		} catch {
			arr = []
		}
		if (arr.some((x) => x && x.moonraker_url === p.moonraker_url)) {
			return false
		}
		const id = slugify(p.hostname || p.host)
		arr.push({
			id: arr.some((x) => x && x.id === id) ? `${id}-${arr.length + 1}` : id,
			name: p.hostname || p.host,
			moonraker_url: p.moonraker_url,
			camera_url: `${p.moonraker_url.replace(/:\d+$/, '')}:8080/?action=snapshot`,
			default: arr.length === 0,
		})
		multiField.value = JSON.stringify(arr, null, 2)
		return true
	}

	function renderDiscovered(printers) {
		discoverResults.textContent = ''
		if (!printers.length) {
			discoverResults.textContent = ''
			return
		}
		const list = document.createElement('ul')
		list.className = 'nc-print-discover-list'
		for (const p of printers) {
			const li = document.createElement('li')
			const label = document.createElement('span')
			label.textContent = `${p.hostname || p.host} — ${p.moonraker_url} (klippy: ${p.klippy_state})`
			const add = document.createElement('button')
			add.type = 'button'
			add.className = 'secondary'
			add.textContent = 'Add'
			add.addEventListener('click', () => {
				add.disabled = addPrinterToConfig(p) ? true : add.disabled
				add.textContent = 'Added'
			})
			li.appendChild(label)
			li.appendChild(add)
			list.appendChild(li)
		}
		discoverResults.appendChild(list)
	}

	if (discoverBtn && discoverUrl) {
		discoverBtn.addEventListener('click', async () => {
			discoverBtn.disabled = true
			discoverStatus.textContent = 'Scanning the network for Moonraker printers…'
			discoverResults.textContent = ''
			try {
				const res = await fetch(discoverUrl, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json', requesttoken: OC.requestToken },
					body: JSON.stringify({}),
				})
				if (!res.ok) {
					throw new Error('HTTP ' + res.status)
				}
				const data = await res.json()
				const printers = data.printers || []
				discoverStatus.textContent = printers.length
					? `Found ${printers.length} printer(s).`
					: 'No Moonraker printers found on this subnet.'
				renderDiscovered(printers)
			} catch (err) {
				discoverStatus.textContent = 'Scan failed: ' + (err.message || err)
			} finally {
				discoverBtn.disabled = false
			}
		})
	}

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
