import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'

export async function checkPrintGuard({ printerId = '', prev = null, notify = false } = {}) {
	const params = {}
	if (printerId) params.printer_id = printerId
	if (prev) params.prev = JSON.stringify(prev)
	if (notify) params.notify = 1
	const { data } = await axios.get(generateUrl('/apps/nc_print/api/print-guard/check'), {
		timeout: 10000,
		params,
	})
	return data
}
