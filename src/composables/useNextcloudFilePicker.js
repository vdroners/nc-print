import { fetchModelBlob } from '@/services/files-api.js'
import { toastError } from '@/services/toast.js'

/**
 * @param {object} opts
 * @param {string} opts.title
 * @param {(node: object) => boolean} opts.filter
 * @param {(node: object) => boolean} opts.canPick
 * @param {boolean} [opts.allowGcode]
 * @returns {Promise<{ file: File, davPath: string }|null>}
 */
export async function pickFileFromNextcloud({ title, filter, canPick, allowGcode = false }) {
	try {
		const dialogs = await import('@nextcloud/dialogs')
		const { getFilePickerBuilder, FilePickerClosed } = dialogs
		const builder = getFilePickerBuilder(title)
		builder.setMultiSelect(false)
		builder.setFilter(filter)
		builder.setCanPick(canPick)
		const picker = builder.build()
		const result = await picker.pick()
		if (!result) {
			return null
		}
		let path = ''
		if (typeof result === 'string') {
			path = result
		} else if (Array.isArray(result)) {
			path = result[0]?.path || ''
		} else {
			path = result?.path || ''
		}
		if (!path) {
			return null
		}
		const blob = await fetchModelBlob({ dav_path: path, allow_gcode: allowGcode })
		const name = path.split('/').pop() || (allowGcode ? 'job.gcode' : 'model.stl')
		return {
			file: new File([blob], name, { type: blob.type || 'application/octet-stream' }),
			davPath: path,
		}
	} catch (e) {
		if (e?.constructor?.name === 'FilePickerClosed') {
			return null
		}
		toastError('File pick failed', e)
		return null
	}
}
