<?php

declare(strict_types=1);

namespace OCA\NcPrint\Controller;

use OCA\NcPrint\AppInfo\Application;
use OCA\NcPrint\Service\AccessService;
use OCA\NcPrint\Service\ConfigService;
use OCA\NcPrint\Util\UrlSafety;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\DataDisplayResponse;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IRequest;
use Psr\Log\LoggerInterface;

/**
 * Server-side camera snapshot fetch so the browser never talks to the printer
 * LAN address directly (mixed-content + SSRF mitigation).
 */
class CameraController extends Controller
{
	public function __construct(
		IRequest $request,
		private ConfigService $config,
		private AccessService $access,
		private LoggerInterface $logger,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	#[NoCSRFRequired]
	#[NoAdminRequired]
	public function frame(): DataDisplayResponse|JSONResponse
	{
		if (!$this->access->canUseApp()) {
			return new JSONResponse(
				$this->access->forbiddenJsonPayload(),
				Http::STATUS_FORBIDDEN,
			);
		}

		if (!$this->config->isMoonrakerEnabled()) {
			return new JSONResponse(
				['error' => 'feature_disabled'],
				Http::STATUS_SERVICE_UNAVAILABLE,
			);
		}

		$url = $this->config->resolveCameraUrl($this->request->getParam('printer_id'));
		if (!$this->isSafeCameraUrl($url)) {
			return new JSONResponse(
				['error' => 'invalid_camera_url'],
				Http::STATUS_INTERNAL_SERVER_ERROR,
			);
		}

		$ch = curl_init();
		curl_setopt($ch, CURLOPT_URL, $url);
		curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
		curl_setopt($ch, CURLOPT_TIMEOUT, 10);
		curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
		curl_setopt($ch, CURLOPT_FOLLOWLOCATION, false);
		curl_setopt($ch, CURLOPT_PROTOCOLS, CURLPROTO_HTTP | CURLPROTO_HTTPS);
		$body = curl_exec($ch);
		$code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
		$contentType = (string) curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
		$error = curl_error($ch);
		curl_close($ch);

		if ($body === false || $error !== '' || $code < 200 || $code >= 300) {
			$this->logger->warning('Camera frame fetch failed', [
				'error' => $error,
				'http_code' => $code,
			]);
			return new JSONResponse(
				['error' => 'camera_unreachable'],
				Http::STATUS_BAD_GATEWAY,
			);
		}

		$resp = new DataDisplayResponse($body, Http::STATUS_OK);
		$resp->addHeader('Content-Type', $this->normalizeImageContentType($contentType));
		$resp->addHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
		return $resp;
	}

	private function isSafeCameraUrl(string $url): bool
	{
		return UrlSafety::isSafeHttpUrl($url);
	}

	private function normalizeImageContentType(string $contentType): string
	{
		if ($contentType !== '' && str_starts_with(strtolower($contentType), 'image/')) {
			return explode(';', $contentType)[0];
		}
		return 'image/jpeg';
	}
}
