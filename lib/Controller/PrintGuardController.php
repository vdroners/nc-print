<?php

declare(strict_types=1);

namespace OCA\NcPrint\Controller;

use OCA\NcPrint\AppInfo\Application;
use OCA\NcPrint\Service\AccessService;
use OCA\NcPrint\Service\ConfigService;
use OCA\NcPrint\Service\MoonrakerHttp;
use OCA\NcPrint\Service\OutboundWebhookService;
use OCA\NcPrint\Service\PrintGuardService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\JSONResponse;
use OCP\Http\Client\IClientService;
use OCP\IRequest;
use Psr\Log\LoggerInterface;

class PrintGuardController extends Controller
{
	public function __construct(
		IRequest $request,
		private AccessService $access,
		private ConfigService $config,
		private PrintGuardService $guard,
		private OutboundWebhookService $webhooks,
		private IClientService $clientService,
		private LoggerInterface $logger,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	#[NoCSRFRequired]
	#[NoAdminRequired]
	public function check(): JSONResponse
	{
		if (!$this->access->canUseApp()) {
			return new JSONResponse($this->access->forbiddenJsonPayload(), Http::STATUS_FORBIDDEN);
		}
		if (!$this->config->isMoonrakerEnabled()) {
			return new JSONResponse(['ok' => false, 'error' => 'moonraker_disabled'], Http::STATUS_BAD_REQUEST);
		}

		$printerId = trim((string) $this->request->getParam('printer_id', ''));
		try {
			$base = $this->config->resolveMoonrakerUrlOrFail($printerId !== '' ? $printerId : null);
		} catch (\InvalidArgumentException $e) {
			return new JSONResponse(['ok' => false, 'error' => $e->getMessage()], Http::STATUS_BAD_REQUEST);
		}

		$url = rtrim($base, '/') . '/printer/objects/query?print_stats&display_status&virtual_sdcard&extruder&heater_bed&filament_switch_sensor';
		$body = $this->fetchGuardStatus($url);
		if ($body === null) {
			return new JSONResponse(['ok' => false, 'error' => 'moonraker_unreachable'], Http::STATUS_BAD_GATEWAY);
		}
		$status = is_array($body) ? ($body['result']['status'] ?? []) : [];
		if (!is_array($status)) {
			$status = [];
		}

		$prev = null;
		$rawPrev = $this->request->getParam('prev');
		if (is_string($rawPrev) && $rawPrev !== '') {
			$decoded = json_decode($rawPrev, true);
			if (is_array($decoded)) {
				$prev = $decoded;
			}
		}
		$result = $this->guard->evaluate($status, $prev);
		$notify = filter_var($this->request->getParam('notify', false), FILTER_VALIDATE_BOOLEAN);
		if ($notify && $result['alerts'] !== []) {
			foreach ($result['alerts'] as $alert) {
				$this->webhooks->dispatch(
					'guard',
					'Print Guard: ' . ($alert['type'] ?? 'alert'),
					(string) ($alert['message'] ?? ''),
					[
						'printer_id' => $printerId,
						'alert' => $alert,
						'filename' => $result['snapshot']['filename'] ?? '',
					],
				);
			}
		}

		return new JSONResponse([
			'ok' => true,
			'alerts' => $result['alerts'],
			'snapshot' => $result['snapshot'],
		]);
	}

	/**
	 * Status read only. One retry on a transient connect failure.
	 *
	 * @return array<string, mixed>|null
	 */
	private function fetchGuardStatus(string $url): ?array
	{
		$client = $this->clientService->newClient();
		$options = [
			'timeout' => MoonrakerHttp::PROBE_TIMEOUT_SECONDS,
			'connect_timeout' => MoonrakerHttp::PROBE_CONNECT_SECONDS,
			'nextcloud' => ['allow_local_address' => true],
		];
		$last = null;
		for ($attempt = 1; $attempt <= MoonrakerHttp::PROBE_MAX_ATTEMPTS; $attempt++) {
			try {
				$resp = $client->get($url, $options);
				$decoded = json_decode($resp->getBody(), true);
				return is_array($decoded) ? $decoded : [];
			} catch (\Throwable $e) {
				$last = $e;
				if ($attempt >= MoonrakerHttp::PROBE_MAX_ATTEMPTS || !MoonrakerHttp::throwableIsTransientConnect($e)) {
					break;
				}
			}
		}
		$this->logger->warning('print guard moonraker fetch failed', ['exception' => $last]);
		return null;
	}
}
