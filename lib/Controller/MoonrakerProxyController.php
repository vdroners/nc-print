<?php

declare(strict_types=1);

namespace OCA\NcPrint\Controller;

use OCA\NcPrint\AppInfo\Application;
use OCA\NcPrint\Service\AccessService;
use OCA\NcPrint\Service\ConfigService;
use OCA\NcPrint\Service\PathSanitizer;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\UserRateLimit;
use OCP\AppFramework\Http\JSONResponse;
use OCP\AppFramework\Http\Response;
use OCP\IRequest;
use Psr\Log\LoggerInterface;

/**
 * Proxies a Moonraker API path+method allowlist. Only the configured (or
 * session-registered) Moonraker base URL may be contacted — user-supplied hosts
 * in paths or query are rejected. Most writes go through PrinterController;
 * intentional UI POSTs for job queue and power devices are allowlisted here.
 */
class MoonrakerProxyController extends Controller
{
	/** GET (and HEAD) prefixes — monitoring / read surfaces. */
	private const ALLOWED_GET_PREFIXES = [
		'server/info',
		'server/files/',
		'printer/objects/',
		'printer/print/',
		'server/temperature_store', // WS10 temp graph
		'server/history/', // WS15 history/statistics
		'server/job_queue/', // WS13 print/job queue (list)
		'machine/timelapse/', // WS16 timelapse
		'server/timelapse', // WS16 timelapse (settings)
		'machine/device_power/', // WS10/WS14 optional power/fan/LED (list)
		'server/spoolman/', // WS14 filament (Spoolman)
		'server/webcams', // multi-webcam list/picker
		'machine/update/status', // update_manager status (read-only)
		'machine/update_manager/status', // update_manager status (alt path)
		'server/announcements/', // Moonraker service announcements
	];

	/**
	 * POST-only write prefixes used by the UI (queue mutate + power toggle).
	 * PUT/PATCH/DELETE are never allowed through this proxy.
	 */
	private const ALLOWED_POST_PREFIXES = [
		'server/job_queue/',
		'machine/device_power/',
	];

	private const CONNECT_TIMEOUT_SECONDS = 5;
	private const DEFAULT_TIMEOUT_SECONDS = 60;
	private const MAX_BODY_BYTES = 10 * 1024 * 1024;

	public function __construct(
		IRequest $request,
		private ConfigService $config,
		private AccessService $access,
		private LoggerInterface $logger,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	#[NoAdminRequired]
	#[UserRateLimit(limit: 120, period: 60)]
	public function proxy(string $path): Response
	{
		if (!$this->access->canUseApp()) {
			return new JSONResponse(
				$this->access->forbiddenJsonPayload(),
				Http::STATUS_FORBIDDEN,
			);
		}

		if (!$this->config->isMoonrakerEnabled()) {
			return new JSONResponse(
				[
					'error' => 'feature_disabled',
					'message' => 'Moonraker integration is disabled by the administrator.',
				],
				Http::STATUS_SERVICE_UNAVAILABLE,
			);
		}

		if (PathSanitizer::hasTraversalAttempt($path)) {
			$this->logger->warning('MoonrakerProxyController blocked traversal attempt', [
				'path' => $path,
			]);
			return new JSONResponse(
				['error' => 'invalid_path', 'message' => 'Path traversal blocked'],
				Http::STATUS_BAD_REQUEST,
			);
		}

		$safePath = PathSanitizer::normalize($path);
		$method = strtoupper($this->request->getMethod());
		if (!$this->isAllowedMoonrakerRequest($safePath, $method)) {
			return new JSONResponse(
				[
					'error' => 'path_not_allowed',
					'message' => 'Moonraker path/method not on allowlist',
				],
				Http::STATUS_FORBIDDEN,
			);
		}

		$targetUrl = $this->buildTargetUrl($safePath);
		if ($targetUrl === null) {
			return new JSONResponse(
				[
					'error' => 'invalid_config',
					'message' => 'Moonraker internal URL is not configured safely',
				],
				Http::STATUS_INTERNAL_SERVER_ERROR,
			);
		}

		$query = $this->sanitizeQueryString(
			$this->request->server['QUERY_STRING'] ?? '',
		);
		if ($query !== '') {
			if (!$this->isSafeQueryString($query)) {
				return new JSONResponse(
					['error' => 'invalid_query', 'message' => 'Query string blocked'],
					Http::STATUS_BAD_REQUEST,
				);
			}
			$targetUrl .= '?' . $query;
		}

		$body = null;
		if (in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'], true)) {
			$contentLength = (int) ($this->request->server['CONTENT_LENGTH'] ?? 0);
			if ($contentLength > self::MAX_BODY_BYTES) {
				return new JSONResponse(
					['message' => 'Request body too large (max 10 MB)', 'reason' => 'request_too_large'],
					Http::STATUS_REQUEST_ENTITY_TOO_LARGE,
				);
			}
			$fh = fopen('php://input', 'r');
			$body = $fh ? stream_get_contents($fh, self::MAX_BODY_BYTES + 1) : '';
			if ($fh) {
				fclose($fh);
			}
			if ($body === false || strlen($body) > self::MAX_BODY_BYTES) {
				return new JSONResponse(
					['message' => 'Request body too large (max 10 MB)', 'reason' => 'request_too_large'],
					Http::STATUS_REQUEST_ENTITY_TOO_LARGE,
				);
			}
		}

		$ch = curl_init();
		curl_setopt($ch, CURLOPT_URL, $targetUrl);
		curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
		curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
		curl_setopt($ch, CURLOPT_TIMEOUT, self::DEFAULT_TIMEOUT_SECONDS);
		curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, self::CONNECT_TIMEOUT_SECONDS);
		curl_setopt($ch, CURLOPT_FOLLOWLOCATION, false);
		curl_setopt($ch, CURLOPT_PROTOCOLS, CURLPROTO_HTTP | CURLPROTO_HTTPS);

		$incomingCt = $this->request->getHeader('Content-Type');
		$contentType = ($incomingCt !== '') ? $incomingCt : 'application/json';
		$headers = ['Content-Type: ' . $contentType];
		curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

		if ($body !== null && $body !== '') {
			curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
		}

		$responseBody = curl_exec($ch);
		$httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
		$error = curl_error($ch);
		curl_close($ch);

		if ($responseBody === false || $error !== '') {
			$this->logger->error('Moonraker proxy cURL error', [
				'error' => $error,
				'url' => $targetUrl,
			]);
			return new JSONResponse(
				[
					'error' => 'backend_unreachable',
					'message' => 'Moonraker service unreachable',
				],
				Http::STATUS_BAD_GATEWAY,
			);
		}

		$data = json_decode($responseBody, true);
		if ($data === null && json_last_error() !== JSON_ERROR_NONE) {
			$resp = new \OCP\AppFramework\Http\DataDisplayResponse($responseBody, $httpCode);
			$resp->addHeader('Content-Type', 'application/octet-stream');
			return $resp;
		}

		return new JSONResponse($data, $httpCode);
	}

	private function isAllowedMoonrakerRequest(string $safePath, string $method): bool
	{
		if ($method === 'GET' || $method === 'HEAD') {
			return $this->pathMatchesPrefixes($safePath, self::ALLOWED_GET_PREFIXES);
		}
		if ($method === 'POST') {
			return $this->pathMatchesPrefixes($safePath, self::ALLOWED_POST_PREFIXES);
		}
		return false;
	}

	/**
	 * @param list<string> $prefixes
	 */
	private function pathMatchesPrefixes(string $safePath, array $prefixes): bool
	{
		foreach ($prefixes as $prefix) {
			if ($safePath === rtrim($prefix, '/')) {
				return true;
			}
			if (str_starts_with($safePath, $prefix)) {
				return true;
			}
		}
		return false;
	}

	private function buildTargetUrl(string $safePath): ?string
	{
		$printerId = $this->request->getParam('printer_id');
		$printerId = is_string($printerId) && $printerId !== '' ? $printerId : null;
		try {
			$base = rtrim($this->config->resolveMoonrakerUrlOrFail($printerId), '/');
		} catch (\InvalidArgumentException) {
			return null;
		}
		$parts = parse_url($base);
		if ($parts === false || !isset($parts['scheme'], $parts['host'])) {
			return null;
		}

		$scheme = strtolower((string) $parts['scheme']);
		if (!in_array($scheme, ['http', 'https'], true)) {
			return null;
		}

		$host = (string) $parts['host'];
		if ($host === '' || filter_var($host, FILTER_VALIDATE_IP) === false
			&& !preg_match('/^[a-z0-9.-]+$/i', $host)) {
			return null;
		}

		$port = isset($parts['port']) ? ':' . (int) $parts['port'] : '';
		$basePath = isset($parts['path']) ? rtrim((string) $parts['path'], '/') : '';

		return $scheme . '://' . $host . $port . $basePath . '/' . $safePath;
	}

	private function isSafeQueryString(string $query): bool
	{
		$blocked = ['http://', 'https://', '//', '@', 'file:', 'ftp:'];
		$lower = strtolower($query);
		foreach ($blocked as $needle) {
			if (str_contains($lower, $needle)) {
				return false;
			}
		}
		return true;
	}

	private function sanitizeQueryString(string $raw): string
	{
		$raw = trim($raw);
		if ($raw === '') {
			return '';
		}
		parse_str($raw, $params);
		unset($params['_route'], $params['_url']);
		if (empty($params)) {
			return '';
		}
		return http_build_query($params, '', '&', PHP_QUERY_RFC3986);
	}
}
