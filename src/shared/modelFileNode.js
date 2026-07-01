const MODEL_EXT = /\.(stl|3mf|obj)$/i

export function isModelFilename(name) {
	return MODEL_EXT.test(String(name || ''))
}

export function modelFilePickerFilter(node) {
	const name = node?.basename || node?.displayname || node?.attributes?.displayname || ''
	return isModelFilename(name)
}

export function modelFilePickerCanPick(node) {
	return modelFilePickerFilter(node)
}

export const MODEL_ACCEPT = '.stl,.3mf,.obj'
export const MODEL_MAX_BYTES = 50 * 1024 * 1024

/**
 * @param {File} file
 * @returns {{ ok: boolean, error?: string }}
 */
export function validateModelFile(file) {
	if (!file) {
		return { ok: false, error: 'No file selected' }
	}
	if (!isModelFilename(file.name)) {
		return { ok: false, error: 'Unsupported format — use STL, 3MF, or OBJ' }
	}
	if (file.size > MODEL_MAX_BYTES) {
		return { ok: false, error: 'Model too large (max 50 MB)' }
	}
	if (file.size <= 0) {
		return { ok: false, error: 'File is empty' }
	}
	return { ok: true }
}
