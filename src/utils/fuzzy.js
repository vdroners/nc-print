/**
 * Tiny fuzzy matcher for the command palette. Pure + framework-free so it's
 * unit-testable. Scoring (higher = better):
 *   - exact (case-insensitive) match         → 1000
 *   - text starts with the query             → 800 - len penalty
 *   - query is a contiguous substring        → 600 - index/len penalty
 *   - query chars appear in order (subseq)   → 300 - gap penalty
 *   - no subsequence match                   → -1 (filtered out)
 * An empty query matches everything with score 0 (preserves input order).
 */

/**
 * @param {string} query
 * @param {string} text
 * @returns {number} score, or -1 for no match
 */
export function fuzzyScore(query, text) {
	const q = String(query || '').trim().toLowerCase()
	const t = String(text || '').toLowerCase()
	if (q === '') {
		return 0
	}
	if (t === '') {
		return -1
	}
	if (t === q) {
		return 1000
	}
	if (t.startsWith(q)) {
		return 800 - Math.min(t.length - q.length, 200)
	}
	const idx = t.indexOf(q)
	if (idx >= 0) {
		return 600 - idx - Math.min(t.length - q.length, 100)
	}
	// subsequence: every query char appears in order.
	let ti = 0
	let gaps = 0
	let lastMatch = -1
	for (let qi = 0; qi < q.length; qi++) {
		const ch = q[qi]
		let found = -1
		for (; ti < t.length; ti++) {
			if (t[ti] === ch) {
				found = ti
				ti++
				break
			}
		}
		if (found < 0) {
			return -1
		}
		if (lastMatch >= 0) {
			gaps += found - lastMatch - 1
		}
		lastMatch = found
	}
	return 300 - Math.min(gaps, 250)
}

/**
 * Filter + rank a list by fuzzy match against a key. Stable for ties (keeps the
 * original relative order). Returns matches only, best-first.
 * @template T
 * @param {string} query
 * @param {T[]} items
 * @param {(item: T) => string} keyFn
 * @returns {T[]}
 */
export function fuzzyFilter(query, items, keyFn) {
	const q = String(query || '').trim()
	const scored = []
	for (let i = 0; i < items.length; i++) {
		const score = fuzzyScore(q, keyFn(items[i]))
		if (score >= 0) {
			scored.push({ item: items[i], score, i })
		}
	}
	scored.sort((a, b) => (b.score - a.score) || (a.i - b.i))
	return scored.map((s) => s.item)
}
