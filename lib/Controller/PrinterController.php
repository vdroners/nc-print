<?php

declare(strict_types=1);

namespace OCA\NcPrint\Controller;

use OCA\NcPrint\AppInfo\Application;
use OCA\NcPrint\Service\AccessService;
use OCA\NcPrint\Service\ConfigService;
use OCA\NcPrint\Service\MultipartBuilder;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IRequest;
use Psr\Log\LoggerInterface;

class PrinterController extends Controller
{
	private const CONNECT_TIMEOUT_SECONDS = 5;
	private const DEFAULT_TIMEOUT_SECONDS = 60;
	private const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

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
	public function state(): JSONResponse
	{
		if (!$this->access->canUseApp()) {
			return new JSONResponse($this->access->forbiddenJsonPayload(), Http::STATUS_FORBIDDEN);
		}
		if (!$this->config->isMoonrakerEnabled()) {
			return new JSONResponse($this->emptyState('Moonraker integration disabled'));
		}

		$payload = json_encode([
			'objects' => [
				'print_stats' => null,
				'display_status' => null,
				'extruder' => null,
				'heater_bed' => null,
			],
		], JSON_THROW_ON_ERROR);

		$result = $this->moonrakerPost('printer/objects/query', $payload, 'application/json');
		if ($result === null) {
			return new JSONResponse($this->emptyState('Moonraker unreachable'));
		}

		$status = $result['status'] ?? $result['result']['status'] ?? [];
		return new JSONResponse($this->normalizeState($status));
	}

	#[NoCSRFRequired]
	#[NoAdminRequired]
	public function pause(): JSONResponse
	{
		return $this->printAction('printer/print/pause');
	}

	#[NoCSRFRequired]
	#[NoAdminRequired]
	public function resume(): JSONResponse
	{
		return $this->printAction('printer/print/resume');
	}

	#[NoCSRFRequired]
	#[NoAdminRequired]
	public function cancel(): JSONResponse
	{
		return $this->printAction('printer/print/cancel');
	}

	#[NoCSRFRequired]
	#[NoAdminRequired]
	public function upload(): JSONResponse
	{
		if (!$this->access->canUseApp()) {
			return new JSONResponse($this->access->forbiddenJsonPayload(), Http::STATUS_FORBIDDEN);
		}
		if (!$this->config->isMoonrakerEnabled()) {
			return new JSONResponse(
				['error' => 'feature_disabled', 'message' => 'Moonraker integration is disabled.'],
				Http::STATUS_SERVICE_UNAVAILABLE,
			);
		}

		$upload = $this->request->getUploadedFile('file');
		if ($upload === null || ($upload['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
			return new JSONResponse(
				['error' => 'missing_file', 'message' => 'Multipart field "file" is required'],
				Http::STATUS_BAD_REQUEST,
			);
		}

		$size = (int) ($upload['size'] ?? 0);
		if ($size <= 0 || $size > self::MAX_UPLOAD_BYTES) {
			return new JSONResponse(
				['error' => 'invalid_file', 'message' => 'Upload must be between 1 byte and 50 MB'],
				Http::STATUS_BAD_REQUEST,
			);
		}

		$tmp = (string) ($upload['tmp_name'] ?? '');
		if ($tmp === '' || !is_readable($tmp)) {
			return new JSONResponse(
				['error' => 'read_failed', 'message' => 'Could not read uploaded file'],
				Http::STATUS_BAD_REQUEST,
			);
		}

		$binary = file_get_contents($tmp);
		if ($binary === false) {
			return new JSONResponse(
				['error' => 'read_failed', 'message' => 'Could not read uploaded file'],
				Http::STATUS_BAD_REQUEST,
			);
		}

		$filename = (string) ($upload['name'] ?? 'job.gcode');
		$startRaw = (string) ($this->request->getParam('start', '0'));
		$start = in_array(strtolower($startRaw), ['1', 'true', 'yes', 'on'], true);

		$built = MultipartBuilder::buildMoonrakerUpload($binary, $filename, $start);
		$result = $this->moonrakerPost('server/files/upload', $built['body'], $built['contentType']);
		if ($result === null) {
			return new JSONResponse(
				['error' => 'backend_unreachable', 'message' => 'Moonraker upload failed'],
				Http::STATUS_BAD_GATEWAY,
			);
		}

		return new JSONResponse($result);
	}

	private function printAction(string $path): JSONResponse
	{
		if (!$this->access->canUseApp()) {
			return new JSONResponse($this->access->forbiddenJsonPayload(), Http::STATUS_FORBIDDEN);
		}
		if (!$this->config->isMoonrakerEnabled()) {
			return new JSONResponse(
				['error' => 'feature_disabled', 'message' => 'Moonraker integration is disabled.'],
				Http::STATUS_SERVICE_UNAVAILABLE,
			);
		}

		$result = $this->moonrakerPost($path, '{}', 'application/json');
		if ($result === null) {
			return new JSONResponse(
				['error' => 'backend_unreachable', 'message' => 'Moonraker request failed'],
				Http::STATUS_BAD_GATEWAY,
			);
		}

		return new JSONResponse($result);
	}

	/** @return array<string, mixed> */
	private function emptyState(string $message): array
	{
		return [
			'connected' => false,
			'state' => 'offline',
			'progress' => 0.0,
			'extruder_temp' => null,
			'bed_temp' => null,
			'message' => $message,
			'filename' => null,
		];
	}

	/**
	 * @param array<string, mixed> $status
	 * @return array<string, mixed>
	 */
	private function normalizeState(array $status): array
	{
		$printStats = is_array($status['print_stats'] ?? null) ? $status['print_stats'] : [];
		$display = is_array($status['display_status'] ?? null) ? $status['display_status'] : [];
		$extruder = is_array($status['extruder'] ?? null) ? $status['extruder'] : [];
		$bed = is_array($status['heater_bed'] ?? null) ? $status['heater_bed'] : [];
		$info = is_array($printStats['info'] ?? null) ? $printStats['info'] : [];

		$state = (string) ($printStats['state'] ?? 'unknown');
		$progress = $display['progress'] ?? $printStats['print_duration'] ?? 0;
		if (!is_numeric($progress)) {
			$progress = 0.0;
		} else {
			$progress = (float) $progress;
			if ($progress > 1.0) {
				$progress = min(1.0, $progress / 100.0);
			}
		}

		return [
			'connected' => true,
			'state' => $state,
			'progress' => $progress,
			'extruder_temp' => isset($extruder['temperature']) ? (float) $extruder['temperature'] : null,
			'bed_temp' => isset($bed['temperature']) ? (float) $bed['temperature'] : null,
			'message' => (string) ($display['message'] ?? ''),
			'filename' => $printStats['filename'] ?? null,
			'print_duration' => isset($info['print_duration']) ? (float) $info['print_duration'] : null,
			'total_duration' => isset($info['total_duration']) ? (float) $info['total_duration'] : null,
		];
	}

	/** @return array<string, mixed>|null */
	private function moonrakerPost(string $path, string $body, string $contentType): ?array
	{
		$url = rtrim($this->config->getMoonrakerInternalUrl(), '/') . '/' . ltrim($path, '/');

		$ch = curl_init();
		curl_setopt($ch, CURLOPT_URL, $url);
		curl_setopt($ch, CURLOPT_POST, true);
		curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
		curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
		curl_setopt($ch, CURLOPT_TIMEOUT, self::DEFAULT_TIMEOUT_SECONDS);
		curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, self::CONNECT_TIMEOUT_SECONDS);
		curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: ' . $contentType]);

		$responseBody = curl_exec($ch);
		$httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
		$error = curl_error($ch);
		curl_close($ch);

		if ($responseBody === false || $error !== '' || $httpCode < 200 || $httpCode >= 300) {
			$this->logger->warning('PrinterController Moonraker request failed', [
				'path' => $path,
				'http' => $httpCode,
				'error' => $error,
			]);
			return null;
		}

		$data = json_decode((string) $responseBody, true);
		return is_array($data) ? $data : ['result' => $responseBody];
	}
}
