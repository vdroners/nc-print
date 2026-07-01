<?php

declare(strict_types=1);

namespace OCA\NcPrint\Controller;

use OCA\NcPrint\AppInfo\Application;
use OCA\NcPrint\Service\AccessService;
use OCA\NcPrint\Service\ConfigService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IConfig;
use OCP\IRequest;
use OCP\IURLGenerator;

class ApiController extends Controller
{
	public function __construct(
		IRequest $request,
		private IConfig $config,
		private ConfigService $configService,
		private AccessService $access,
		private IURLGenerator $urlGenerator,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function config(): JSONResponse
	{
		if (!$this->access->canUseApp()) {
			return new JSONResponse(
				$this->access->forbiddenJsonPayload(),
				Http::STATUS_FORBIDDEN,
			);
		}

		$bootstrap = $this->configService->publicBootstrap();
		$bootstrap['route_base'] = rtrim(
			$this->urlGenerator->linkToRoute('nc_print.page.index'),
			'/',
		);
		$bootstrap['app_version'] = $this->config->getAppValue(
			Application::APP_ID,
			'installed_version',
			'1.0.0',
		);

		return new JSONResponse($bootstrap);
	}

	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function status(): JSONResponse
	{
		$slicerProbe = $this->probeUrl(
			$this->configService->getSlicerInternalUrl() . '/api/health',
			$this->configService->isSlicerEnabled(),
		);
		$moonrakerProbe = $this->probeUrl(
			$this->configService->getMoonrakerInternalUrl() . '/server/info',
			$this->configService->isMoonrakerEnabled(),
		);

		return new JSONResponse([
			'app_id' => Application::APP_ID,
			'version' => $this->config->getAppValue(
				Application::APP_ID,
				'installed_version',
				'1.0.0',
			),
			'slicer_enabled' => $this->configService->isSlicerEnabled(),
			'moonraker_enabled' => $this->configService->isMoonrakerEnabled(),
			'slicer_ok' => $slicerProbe['ok'],
			'slicer_latency_ms' => $slicerProbe['latency_ms'],
			'slicer_error' => $slicerProbe['error'],
			'slicer_version' => $slicerProbe['version'] ?? null,
			'slicer_upstream' => $slicerProbe['upstream'] ?? null,
			'slicer_config_dir' => $slicerProbe['config_dir'] ?? null,
			'moonraker_ok' => $moonrakerProbe['ok'],
			'moonraker_latency_ms' => $moonrakerProbe['latency_ms'],
			'moonraker_error' => $moonrakerProbe['error'],
			'printer_display_name' => $this->configService->getPrinterDisplayName(),
		]);
	}

	/** @return array{ok: bool, latency_ms: int|null, error: string|null, version?: string, upstream?: string, config_dir?: string} */
	private function probeUrl(string $url, bool $enabled): array
	{
		if (!$enabled) {
			return ['ok' => false, 'latency_ms' => null, 'error' => 'disabled'];
		}

		$started = hrtime(true);
		$ch = curl_init();
		curl_setopt($ch, CURLOPT_URL, $url);
		curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
		curl_setopt($ch, CURLOPT_TIMEOUT, 5);
		curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 3);
		curl_setopt($ch, CURLOPT_FOLLOWLOCATION, false);
		$body = curl_exec($ch);
		$code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
		$error = curl_error($ch);
		curl_close($ch);

		$latencyMs = (int) round((hrtime(true) - $started) / 1_000_000);

		if ($body === false || $error !== '') {
			return ['ok' => false, 'latency_ms' => $latencyMs, 'error' => $error ?: 'unreachable'];
		}
		if ($code < 200 || $code >= 300) {
			return ['ok' => false, 'latency_ms' => $latencyMs, 'error' => 'HTTP ' . $code];
		}

		$result = ['ok' => true, 'latency_ms' => $latencyMs, 'error' => null];
		if (str_contains($url, '/api/health') && is_string($body) && $body !== '') {
			$data = json_decode($body, true);
			if (is_array($data)) {
				if (isset($data['version']) && is_string($data['version'])) {
					$result['version'] = $data['version'];
				}
				if (isset($data['upstream']) && is_string($data['upstream'])) {
					$result['upstream'] = $data['upstream'];
				}
				if (isset($data['config_dir']) && is_string($data['config_dir'])) {
					$result['config_dir'] = $data['config_dir'];
				}
			}
		}

		return $result;
	}
}
