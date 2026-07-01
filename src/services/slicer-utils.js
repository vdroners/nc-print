/**
 * Pure SSE parsing helpers (no Nextcloud deps — safe for unit tests).
 */

/**
 * @param {string} block
 * @returns {{ event: string, data: string }}
 */
export function parseSseBlock(block) {
	let event = 'message'
	let data = ''
	for (const line of block.split('\n')) {
		if (line.startsWith('event:')) {
			event = line.slice(6).trim()
		} else if (line.startsWith('data:')) {
			data += (data ? '\n' : '') + line.slice(5).trim()
		}
	}
	return { event, data }
}

/**
 * @param {string} chunk
 * @param {string} [leftover]
 * @returns {{ leftover: string, events: Array<{ event: string, parsed: object|null }> }}
 */
export function parseSseChunk(chunk, leftover = '') {
	let buffer = leftover + chunk
	const events = []
	let sep
	while ((sep = buffer.indexOf('\n\n')) >= 0) {
		const block = buffer.slice(0, sep)
		buffer = buffer.slice(sep + 2)
		const { event, data } = parseSseBlock(block)
		let parsed = null
		if (data) {
			try {
				parsed = JSON.parse(data)
			} catch {
				parsed = null
			}
		}
		events.push({ event, parsed })
	}
	return { leftover: buffer, events }
}

/**
 * @param {object} form
 * @returns {object}
 */
export function buildSliceOverrides(form = {}) {
	const overrides = {}
	const num = (key, val) => {
		if (val === '' || val === null || val === undefined) {
			return
		}
		const n = Number(val)
		if (!Number.isNaN(n)) {
			overrides[key] = n
		}
	}

	num('layer_height', form.layerHeight)
	num('line_width', form.lineWidth)
	num('perimeters', form.perimeters)
	if (form.infillDensity !== '' && form.infillDensity != null) {
		const pct = Number(form.infillDensity)
		if (!Number.isNaN(pct)) {
			overrides.infill_density = pct > 1 ? pct / 100 : pct
		}
	}
	num('print_speed', form.printSpeed)
	num('first_layer_speed', form.firstLayerSpeed)
	num('nozzle_temperature', form.nozzleTemp)
	num('bed_temperature', form.bedTemp)

	return overrides
}
