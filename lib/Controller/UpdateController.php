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
use OCP\IRequest;
use Psr\Log\LoggerInterface;

/**
 * Trigger a Moonraker update_manager update. This is a deliberately narrow,
 * heavily-guarded write — it restarts printer services — so it is NOT exposed
 * through the generic Moonraker proxy (which stays read-only). Guards:
 *   - admin-only (beyond normal group app access),
 *   - idle-only (refused while a print is active),
 *   - target restricted to a fixed allowlist,
 *   - the frontend additionally requires an explicit confirm.
 */
class UpdateController extends Controller
{
	private const CONNECT_TIMEOUT_SECONDS = 5;
	private const UPDATE_TIMEOUT_SECONDS = 600;

	/** Only these Moonraker update targets may be triggered. */
	private const ALLOWED_TARGETS = ['klipper', 'moonraker', 'client', 'system', 'full'];

	/** Klipper print_stats states that count as "busy" (update refused). */
	private const BUSY_STATES = ['printing', 'paused'];

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
	public function trigger(): JSONResponse
	{
		// Admin-only: an update restarts services and can disrupt a shared
		// printer, so normal (group) app access is not enough.
		if (!$this->access->isAdmin()) {
			return new JSONResponse(
				['error' => 'forbidden', 'message' => 'Updates require a Nextcloud administrator.'],
				Http::STATUS_FORBIDDEN,
			);
		}
		if (!$this->config->isMoonrakerEnabled()) {
			return new JSONResponse(
				['error' => 'feature_disabled', 'message' => 'Moonraker integration is disabled.'],
				Http::STATUS_SERVICE_UNAVAILABLE,
			);
		}

		$params = $this->mergedParams();
		$target = strtolower(trim((string) ($params['target'] ?? '')));
		if (!in_array($target, self::ALLOWED_TARGETS, true)) {
			return new JSONResponse(
				['error' => 'bad_target', 'message' => 'target must be one of: ' . implode(', ', self::ALLOWED_TARGETS)],
				Http::STATUS_BAD_REQUEST,
			);
		}
		$printerId = isset($params['printer_id']) ? (string) $params['printer_id'] : null;

		// Idle-only: refuse if the printer is mid-print (a mid-print service
		// restart would ruin the job). If state can't be read, fail closed.
		$busy = $this->isPrinterBusy($printerId);
		if ($busy === null) {
			return new JSONResponse(
				['error' => 'state_unknown', 'message' => 'Cannot confirm the printer is idle; update refused.'],
				Http::STATUS_CONFLICT,
			);
		}
		if ($busy) {
			return new JSONResponse(
				['error' => 'printer_busy', 'message' => 'Refusing to update while a print is active.'],
				Http::STATUS_CONFLICT,
			);
		}

		$result = $this->moonrakerPost('machine/update/' . $target, '', $printerId);
		if ($result === null) {
			return new JSONResponse(
				['error' => 'update_failed', 'message' => 'Moonraker update request failed.'],
				Http::STATUS_BAD_GATEWAY,
			);
		}
		return new JSONResponse(['ok' => true, 'target' => $target]);
	}

	/**
	 * @return bool|null true=busy, false=idle, null=unknown (fail closed)
	 */
	private function isPrinterBusy(?string $printerId): ?bool
	{
		$payload = json_encode(['objects' => ['print_stats' => null]], JSON_THROW_ON_ERROR);
		$res = $this->moonrakerPost('printer/objects/query', $payload, $printerId);
		if ($res === null) {
			return null;
		}
		$status = $res['status'] ?? $res['result']['status'] ?? null;
		if (!is_array($status) || !isset($status['print_stats']) || !is_array($status['print_stats'])) {
			return null;
		}
		$state = strtolower((string) ($status['print_stats']['state'] ?? ''));
		if ($state === '') {
			return null;
		}
		return in_array($state, self::BUSY_STATES, true);
	}

	private function moonrakerPost(string $path, string $body, ?string $printerId): ?array
	{
		$url = rtrim($this->config->resolveMoonrakerUrl($printerId), '/') . '/' . ltrim($path, '/');
		$ch = curl_init();
		curl_setopt($ch, CURLOPT_URL, $url);
		curl_setopt($ch, CURLOPT_POST, true);
		curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
		curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
		curl_setopt($ch, CURLOPT_TIMEOUT, self::UPDATE_TIMEOUT_SECONDS);
		curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, self::CONNECT_TIMEOUT_SECONDS);
		curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
		$responseBody = curl_exec($ch);
		$httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
		$error = curl_error($ch);
		curl_close($ch);
		if ($responseBody === false || $error !== '' || $httpCode < 200 || $httpCode >= 300) {
			$this->logger->warning('UpdateController Moonraker request failed', [
				'path' => $path, 'http' => $httpCode, 'error' => $error,
			]);
			return null;
		}
		$data = json_decode((string) $responseBody, true);
		return is_array($data) ? $data : ['result' => $responseBody];
	}

	/** @return array<string, mixed> */
	private function mergedParams(): array
	{
		$params = $this->request->getParams();
		$raw = file_get_contents('php://input');
		if (is_string($raw) && $raw !== '') {
			$json = json_decode($raw, true);
			if (is_array($json)) {
				$params = array_merge($params, $json);
			}
		}
		return $params;
	}
}
