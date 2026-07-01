/**
 * Poll a snapshot/MJPEG URL with cache-bust for live camera panels.
 * @param {import('vue').Ref<string|null>|function} urlSource
 * @param {number} intervalMs
 */
export function useCameraFrame(urlSource, intervalMs = 2000) {
	return {
		data() {
			return {
				cameraFrameUrl: '',
				cameraError: false,
				cameraErrorMessage: '',
				_cameraTimer: null,
			}
		},
		computed: {
			_baseCameraUrl() {
				const src = typeof urlSource === 'function' ? urlSource.call(this) : this[urlSource]
				return src || ''
			},
		},
		watch: {
			_baseCameraUrl: {
				immediate: true,
				handler(url) {
					this._stopCameraPoll()
					this.cameraError = false
					this.cameraErrorMessage = ''
					if (!url) {
						this.cameraFrameUrl = ''
						return
					}
					this._refreshCameraFrame()
					this._cameraTimer = setInterval(() => this._refreshCameraFrame(), intervalMs)
				},
			},
		},
		beforeDestroy() {
			this._stopCameraPoll()
		},
		methods: {
			_refreshCameraFrame() {
				if (!this._baseCameraUrl) {
					return
				}
				const sep = this._baseCameraUrl.includes('?') ? '&' : '?'
				this.cameraFrameUrl = `${this._baseCameraUrl}${sep}t=${Date.now()}`
			},
			_stopCameraPoll() {
				if (this._cameraTimer) {
					clearInterval(this._cameraTimer)
					this._cameraTimer = null
				}
			},
			onCameraError() {
				this.cameraError = true
				this.cameraErrorMessage = 'Camera stream unavailable'
			},
			retryCamera() {
				this.cameraError = false
				this.cameraErrorMessage = ''
				this._refreshCameraFrame()
			},
		},
	}
}
