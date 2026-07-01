const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Trap keyboard focus inside a modal container until deactivate() is called.
 * @param {HTMLElement} container
 * @returns {{ deactivate: () => void }}
 */
export function activateFocusTrap(container) {
	if (!container) {
		return { deactivate: () => {} }
	}

	const previouslyFocused = document.activeElement

	const getFocusables = () => Array.from(container.querySelectorAll(FOCUSABLE))
		.filter(el => el.offsetParent !== null || el === document.activeElement)

	const focusFirst = () => {
		const items = getFocusables()
		if (items.length) {
			items[0].focus()
		} else {
			container.setAttribute('tabindex', '-1')
			container.focus()
		}
	}

	const onKeydown = (e) => {
		if (e.key !== 'Tab') {
			return
		}
		const items = getFocusables()
		if (!items.length) {
			e.preventDefault()
			return
		}
		const first = items[0]
		const last = items[items.length - 1]
		if (e.shiftKey) {
			if (document.activeElement === first) {
				e.preventDefault()
				last.focus()
			}
		} else if (document.activeElement === last) {
			e.preventDefault()
			first.focus()
		}
	}

	document.addEventListener('keydown', onKeydown)
	focusFirst()

	return {
		deactivate() {
			document.removeEventListener('keydown', onKeydown)
			if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
				previouslyFocused.focus()
			}
		},
	}
}
