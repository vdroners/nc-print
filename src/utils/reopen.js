/**
 * Merge recent models and recent slice jobs into a single "Open recent"
 * list, newest first. Pure — shared by ReopenMenu and its unit tests.
 *
 * @param {Array<object>} recentModels entries from store.recentModels
 * @param {Array<object>} jobHistory entries from store.jobHistory
 * @param {number} [limit] max rows to return
 * @returns {Array<{type:'model'|'job', label:string, at:number, entry:object, key:string}>}
 */
export function buildReopenList(recentModels, jobHistory, limit = 10) {
	const models = (Array.isArray(recentModels) ? recentModels : []).map((r, i) => ({
		type: 'model',
		label: r.name || 'Model',
		at: Number(r.at) || 0,
		entry: r,
		key: `model:${r.key || r.name || i}`,
	}))
	const jobs = (Array.isArray(jobHistory) ? jobHistory : []).map((r, i) => ({
		type: 'job',
		label: r.modelName || r.gcodeFilename || 'Slice job',
		at: Number(r.timestamp) || 0,
		entry: r,
		key: `job:${r.id || i}`,
	}))
	return [...models, ...jobs]
		.sort((a, b) => b.at - a.at)
		.slice(0, limit)
}
