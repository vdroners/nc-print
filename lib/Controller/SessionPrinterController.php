<?php

declare(strict_types=1);

namespace OCA\NcPrint\Controller;

use OCA\NcPrint\AppInfo\Application;
use OCA\NcPrint\Service\AccessService;
use OCA\NcPrint\Service\SessionPrinterService;
use OCA\NcPrint\Util\UrlSafety;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IRequest;

class SessionPrinterController extends Controller
{
	public function __construct(
		IRequest $request,
		private AccessService $access,
		private SessionPrinterService $sessionPrinters,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	#[NoAdminRequired]
	public function registerSession(): JSONResponse
	{
		if (!$this->access->canUseApp()) {
			return new JSONResponse($this->access->forbiddenJsonPayload(), Http::STATUS_FORBIDDEN);
		}

		$params = json_decode((string) file_get_contents('php://input'), true);
		if (!is_array($params)) {
			$params = $this->request->getParams();
		}

		$moonrakerUrl = trim((string) ($params['moonraker_url'] ?? ''));
		if ($moonrakerUrl === '') {
			return new JSONResponse([
				'error' => 'invalid_request',
				'message' => 'moonraker_url is required',
			], Http::STATUS_BAD_REQUEST);
		}
		if (!UrlSafety::isSafeHttpUrl($moonrakerUrl)) {
			return new JSONResponse([
				'error' => 'invalid_url',
				'message' => 'Moonraker URL is not allowed',
			], Http::STATUS_BAD_REQUEST);
		}

		$id = trim((string) ($params['id'] ?? ''));
		if ($id === '') {
			$host = parse_url($moonrakerUrl, PHP_URL_HOST);
			$id = 'found:' . ($host ?: 'printer');
		}

		$cameraUrl = trim((string) ($params['camera_url'] ?? ''));
		if ($cameraUrl === '') {
			$base = preg_replace('#:\d+$#', '', $moonrakerUrl);
			if (is_string($base) && $base !== '') {
				$cameraUrl = $base . ':8080/?action=snapshot';
			}
		}
		if ($cameraUrl !== '' && !UrlSafety::isSafeHttpUrl($cameraUrl)) {
			return new JSONResponse([
				'error' => 'invalid_url',
				'message' => 'Camera URL is not allowed',
			], Http::STATUS_BAD_REQUEST);
		}

		try {
			$row = $this->sessionPrinters->register([
				'id' => $id,
				'name' => (string) ($params['name'] ?? $id),
				'moonraker_url' => $moonrakerUrl,
				'camera_url' => $cameraUrl,
			]);
		} catch (\InvalidArgumentException $e) {
			return new JSONResponse([
				'error' => 'invalid_request',
				'message' => $e->getMessage(),
			], Http::STATUS_BAD_REQUEST);
		}

		return new JSONResponse([
			'ok' => true,
			'printer' => [
				'id' => (string) ($row['id'] ?? ''),
				'name' => (string) ($row['name'] ?? ''),
				'default' => false,
			],
		]);
	}
}
