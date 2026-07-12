/**
 * Per-user achievements — derived server-side from the current user's print
 * history. Read-only.
 */
import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'

const REQ = { timeout: 8000 }

/**
 * @returns {Promise<{achievements: object[], summary: {earned: number, total: number, xp: number, xp_total: number}}>}
 */
export async function fetchAchievements() {
	const { data } = await axios.get(generateUrl('/apps/nc_print/api/achievements'), REQ)
	return data
}
