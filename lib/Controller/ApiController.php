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
		if (!$this->access->canUseApp()) {
			return new JSONResponse(
				$this->access->forbiddenJsonPayload(),
				Http::STATUS_FORBIDDEN,
			);
		}

		$slicerProbe = $this->probeUrl(
			$this->configService->getSlicerInternalUrl() . '/api/health',
			$this->configService->isSlicerEnabled(),
			$this->configService->isSlicerConfigured(),
		);
		$probePrinterId = trim((string) $this->request->getParam('printer_id', ''));
		$moonrakerBase = $this->configService->resolveMoonrakerProbeUrl(
			$probePrinterId !== '' ? $probePrinterId : null,
		);
		$moonrakerProbe = $this->probeUrl(
			$moonrakerBase . '/server/info',
			$this->configService->isMoonrakerEnabled(),
			$this->configService->isMoonrakerConfigured(),
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
			'console_enabled' => $this->configService->isConsoleEnabled(),
			'moonraker_configured' => $this->configService->isMoonrakerConfigured(),
			'slicer_configured' => $this->configService->isSlicerConfigured(),
			// WS-foundation feature detection: which optional Moonraker
			// components / plugins exist so the UI can hide unsupported tabs.
			'moonraker_features' => $this->detectMoonrakerFeatures($moonrakerProbe),
			'printer_display_name' => $this->configService->getPrinterDisplayName(),
			'multi_printers' => $this->configService->clientSafeMultiPrinters(),
		]);
	}

	/** @return array{ok: bool, latency_ms: int|null, error: string|null, version?: string, upstream?: string, config_dir?: string} */
	private function probeUrl(string $url, bool $enabled, bool $configured = true): array
	{
		if (!$enabled) {
			return ['ok' => false, 'latency_ms' => null, 'error' => 'disabled'];
		}
		if (!$configured || trim($url) === '' || $url === '/api/health' || $url === '/server/info') {
			return ['ok' => false, 'latency_ms' => null, 'error' => 'not_configured'];
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
		if (str_contains($url, '/server/info') && is_string($body) && $body !== '') {
			$data = json_decode($body, true);
			$components = $data['result']['components'] ?? $data['components'] ?? null;
			if (is_array($components)) {
				$result['components'] = array_values(array_filter($components, 'is_string'));
			}
		}

		return $result;
	}

	/**
	 * Map the Moonraker `server/info` components list to the optional feature
	 * flags the UI branches on. Absent probe → all false.
	 *
	 * @param array<string, mixed> $moonrakerProbe
	 * @return array<string, bool>
	 */
	private function detectMoonrakerFeatures(array $moonrakerProbe): array
	{
		$components = [];
		if (isset($moonrakerProbe['components']) && is_array($moonrakerProbe['components'])) {
			$components = array_map('strtolower', $moonrakerProbe['components']);
		}
		$has = static fn (string $name): bool => in_array($name, $components, true);

		return [
			// Klipper-side objects (exclude_object, bed_mesh) are reported by
			// printer/objects/list at runtime; expose the Moonraker-plugin
			// components here and let the client refine with an objects query.
			'history' => $has('history'),
			'job_queue' => $has('job_queue'),
			'timelapse' => $has('timelapse'),
			'spoolman' => $has('spoolman'),
			'power' => $has('power'),
			'webcam' => $has('webcam') || $has('webcam_manager'),
			'update_manager' => $has('update_manager'),
			'announcements' => $has('announcements') || $has('announcement_manager'),
		];
	}
}
