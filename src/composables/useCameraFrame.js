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
				// True only after <img @load> reports a decoded frame. A URL
				// that never paints stays on the "No stream" placeholder.
				cameraFrameReady: false,
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
					this.cameraFrameReady = false
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
			onCameraLoad(event) {
				const img = event?.target
				const width = img?.naturalWidth || 0
				const height = img?.naturalHeight || 0
				if (width > 0 && height > 0) {
					this.cameraFrameReady = true
					this.cameraError = false
					this.cameraErrorMessage = ''
					return
				}
				this.cameraFrameReady = false
				this.cameraError = true
				this.cameraErrorMessage = 'Camera stream unavailable'
			},
			onCameraError() {
				this.cameraFrameReady = false
				this.cameraError = true
				this.cameraErrorMessage = 'Camera stream unavailable'
			},
			retryCamera() {
				this.cameraError = false
				this.cameraErrorMessage = ''
				this.cameraFrameReady = false
				this._refreshCameraFrame()
			},
		},
	}
}
