/**
 * Files app: Open model or G-code in NC 3D Print.
 */
import { generateUrl } from '@nextcloud/router'
import { registerFileAction, Permission } from '@nextcloud/files'

const ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">'
	+ '<rect x="3" y="14" width="18" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/>'
	+ '<path d="M7 14 V9 L12 5 L17 9 V14" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>'
	+ '<circle cx="12" cy="8.5" r="1.2" fill="currentColor"/>'
	+ '</svg>'

const MODEL_EXT = /\.(stl|3mf|obj)$/i
const GCODE_EXT = /\.gcode$/i

function nodePerms(node) {
	if (typeof node.permissions === 'number') {
		return node.permissions
	}
	if (typeof node.getPermissions === 'function') {
		return node.getPermissions()
	}
	return Permission.READ
}

function nodeName(node) {
	return node?.basename || node?.displayname || node?.name || ''
}

function nodeId(node) {
	if (node && typeof node.fileid === 'number') {
		return node.fileid
	}
	if (node && typeof node.id === 'number') {
		return node.id
	}
	return null
}

function isModel(node) {
	return MODEL_EXT.test(nodeName(node))
}

function isGcode(node) {
	return GCODE_EXT.test(nodeName(node))
}

function isSupported(node) {
	return isModel(node) || isGcode(node)
}

function buildPrintUrl(fileId, tab) {
	const base = generateUrl('/apps/nc_print/')
	let url = `${base}?fileId=${encodeURIComponent(fileId)}`
	if (tab === 'print') {
		url += '&tab=print'
	}
	return url
}

try {
	registerFileAction({
		id: 'nc-print-open',
		displayName({ nodes }) {
			if (!Array.isArray(nodes) || nodes.length !== 1) {
				return 'Open in NC 3D Print'
			}
			if (isGcode(nodes[0])) {
				return 'Open G-code in NC 3D Print'
			}
			return 'Open in NC 3D Print'
		},
		iconSvgInline: () => ICON,
		enabled({ nodes }) {
			if (!Array.isArray(nodes) || nodes.length !== 1) {
				return false
			}
			const n = nodes[0]
			return isSupported(n) && (nodePerms(n) & Permission.READ)
		},
		async exec({ nodes }) {
			if (!Array.isArray(nodes) || !nodes.length) {
				return null
			}
			const id = nodeId(nodes[0])
			if (!id) {
				return null
			}
			const tab = isGcode(nodes[0]) ? 'print' : null
			window.location.href = buildPrintUrl(id, tab)
			return null
		},
		order: 40,
	})

	console.info('[nc_print] Files action registered (Open in NC 3D Print)')
} catch (err) {
	console.error('[nc_print] failed to register Files action:', err)
}
