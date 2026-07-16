<?php

declare(strict_types=1);

namespace OCA\NcPrint\Controller;

use OCA\NcPrint\AppInfo\Application;
use OCA\NcPrint\Service\AccessService;
use OCA\NcPrint\Service\ConfigService;
use OCA\NcPrint\Service\MultipartBuilder;
use OCA\NcPrint\Service\PathSanitizer;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\JSONResponse;
use OCP\AppFramework\Http\Response;
use OCP\IRequest;
use Psr\Log\LoggerInterface;

/**
 * Proxies REST requests to forge-slicer over the internal Docker/LAN network.
 * Supports SSE streaming for slice jobs and multipart uploads up to 50 MB.
 */
class SlicerProxyController extends Controller
{
	private const MAX_BODY_BYTES = 50 * 1024 * 1024;
	private const CONNECT_TIMEOUT_SECONDS = 5;
	private const DEFAULT_TIMEOUT_SECONDS = 120;

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
	public function proxy(string $path): Response
	{
		if (!$this->access->canUseApp()) {
			return new JSONResponse(
				$this->access->forbiddenJsonPayload(),
				Http::STATUS_FORBIDDEN,
			);
		}

		if (!$this->config->isSlicerEnabled()) {
			return new JSONResponse(
				[
					'error' => 'feature_disabled',
					'message' => 'Slicer integration is disabled by the administrator.',
				],
				Http::STATUS_SERVICE_UNAVAILABLE,
			);
		}

		if (PathSanitizer::hasTraversalAttempt($path)) {
			$this->logger->warning('SlicerProxyController blocked traversal attempt', [
				'path' => $path,
			]);
			return new JSONResponse(
				['error' => 'invalid_path', 'message' => 'Path traversal blocked'],
				Http::STATUS_BAD_REQUEST,
			);
		}

		$safePath = PathSanitizer::normalize($path);
		$upstreamPath = $this->resolveUpstreamPath($safePath);
		if (!$this->isAllowedSlicerPath($upstreamPath)) {
			return new JSONResponse(
				[
					'error' => 'path_not_allowed',
					'message' => 'Only api/* paths are proxied to the slicer',
				],
				Http::STATUS_FORBIDDEN,
			);
		}

		$slicerBase = rtrim($this->config->getSlicerInternalUrl(), '/');
		$url = $slicerBase . '/' . $upstreamPath;

		$query = $this->sanitizeQueryString(
			$this->request->server['QUERY_STRING'] ?? '',
		);
		if ($query !== '') {
			$url .= '?' . $query;
		}

		$method = $this->request->getMethod();
		$prebuiltBody = null;
		$prebuiltContentType = null;
		if ($this->shouldConvertOctetStreamSlice($safePath, $upstreamPath, $method)) {
			$converted = $this->buildSliceMultipartFromOctetStream();
			if ($converted instanceof JSONResponse) {
				return $converted;
			}
			$prebuiltBody = $converted['body'];
			$prebuiltContentType = $converted['contentType'];
		}

		if ($this->shouldStreamSse($upstreamPath, $safePath, $method)) {
			$this->streamSseProxy($url, $method, $prebuiltBody, $prebuiltContentType);
		}

		$body = null;
		$contentType = $this->request->getHeader('Content-Type') ?: 'application/json';
		if (in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'], true)) {
			$read = $this->readRequestBody(self::MAX_BODY_BYTES);
			if ($read === null) {
				return new JSONResponse(
					[
						'message' => 'Request body too large (max 50 MB)',
						'reason' => 'request_too_large',
					],
					Http::STATUS_REQUEST_ENTITY_TOO_LARGE,
				);
			}
			$body = $read;
		}

		$ch = curl_init();
		curl_setopt($ch, CURLOPT_URL, $url);
		curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
		curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
		curl_setopt($ch, CURLOPT_TIMEOUT, self::DEFAULT_TIMEOUT_SECONDS);
		curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, self::CONNECT_TIMEOUT_SECONDS);

		$headers = ['Content-Type: ' . $contentType];
		$accept = $this->request->getHeader('Accept');
		if ($accept !== '') {
			$headers[] = 'Accept: ' . $accept;
		}
		curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

		if ($body !== null && $body !== '') {
			curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
		}

		$upstreamHeaders = [];
		curl_setopt($ch, CURLOPT_HEADERFUNCTION, function ($ch, $line) use (&$upstreamHeaders) {
			$parts = explode(':', $line, 2);
			if (count($parts) === 2) {
				$upstreamHeaders[strtolower(trim($parts[0]))] = trim($parts[1]);
			}
			return strlen($line);
		});

		$responseBody = curl_exec($ch);
		$httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
		$error = curl_error($ch);
		curl_close($ch);

		if ($responseBody === false || $error !== '') {
			$this->logger->error('Slicer proxy cURL error', [
				'error' => $error,
				'url' => $url,
			]);
			return new JSONResponse(
				[
					'error' => 'backend_unreachable',
					'message' => 'Slicing engine unreachable',
				],
				Http::STATUS_BAD_GATEWAY,
			);
		}

		$upstreamCt = $upstreamHeaders['content-type'] ?? '';
		if (str_starts_with(strtolower($upstreamCt), 'text/event-stream')) {
			$resp = new \OCP\AppFramework\Http\DataDisplayResponse($responseBody, $httpCode);
			$resp->addHeader('Content-Type', 'text/event-stream');
			$resp->addHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
			$resp->addHeader('X-Accel-Buffering', 'no');
			return $resp;
		}

		if (str_starts_with(strtolower($upstreamCt), 'image/')) {
			$resp = new \OCP\AppFramework\Http\DataDisplayResponse($responseBody, $httpCode);
			$resp->addHeader('Content-Type', $upstreamCt);
			return $resp;
		}

		$data = json_decode($responseBody, true);
		if ($data === null && json_last_error() !== JSON_ERROR_NONE) {
			$resp = new \OCP\AppFramework\Http\DataDisplayResponse($responseBody, $httpCode);
			$resp->addHeader('Content-Type', $upstreamCt ?: 'application/octet-stream');
			return $resp;
		}

		return new JSONResponse($data, $httpCode);
	}

	private function resolveUpstreamPath(string $safePath): string
	{
		if ($safePath === 'slice/stream' || str_ends_with($safePath, '/slice/stream')) {
			return 'api/slice/stream';
		}
		if ($safePath === '' || str_starts_with($safePath, 'api/')) {
			return $safePath;
		}
		return 'api/' . ltrim($safePath, '/');
	}

	/**
	 * Explicit prefix allowlist for the owned slicing engine. Restricts the
	 * proxy to the endpoints the app actually uses, so no unrelated/admin engine
	 * route can be reached through the app even if one exists.
	 */
	private const ALLOWED_SLICER_PREFIXES = [
		'api/health',
		'api/version',
		'api/profiles',
		'api/profile-settings', // full settings for one profile (slim-list lazy hydrate)
		'api/printers',
		'api/slice',        // covers api/slice and api/slice/stream
		'api/jobs/',
		'api/mesh/',
		'api/calibration',  // covers list + calibration/{id}/slice + calibration/generate
		'api/materials',    // filament material reference DB (list + by-id)
		'api/color-order',  // multi-color purge/flush order optimizer
		'api/gcode',        // g-code linter (POST /lint) + reference (GET /reference)
		'api/printer-presets', // static printer model preset lookup
		'api/project/',     // pack a project .3mf (geometry + nc_print_project.json)
	];

	private function isAllowedSlicerPath(string $upstreamPath): bool
	{
		foreach (self::ALLOWED_SLICER_PREFIXES as $prefix) {
			if ($upstreamPath === rtrim($prefix, '/') || str_starts_with($upstreamPath, $prefix)) {
				return true;
			}
		}
		return false;
	}

	private function shouldStreamSse(string $upstreamPath, string $safePath, string $method): bool
	{
		if ($upstreamPath === 'api/slice/stream' && strtoupper($method) === 'POST') {
			return true;
		}
		if ($safePath === 'slice/stream' || $upstreamPath === 'api/slice/stream') {
			return strtoupper($method) === 'POST';
		}
		if (str_contains($upstreamPath, '/stream') || str_ends_with($upstreamPath, 'stream')) {
			return true;
		}
		$accept = strtolower($this->request->getHeader('Accept'));
		return str_contains($accept, 'text/event-stream');
	}

	/**
	 * @return never
	 */
	private function streamSseProxy(string $url, string $method, ?string $bodyOverride = null, ?string $contentTypeOverride = null): void
	{
		while (ob_get_level()) {
			ob_end_clean();
		}

		header('Content-Type: text/event-stream');
		header('Cache-Control: no-cache, no-store, must-revalidate');
		header('X-Accel-Buffering: no');
		header('Connection: keep-alive');

		$forwardHeaders = ['Accept: text/event-stream'];
		$contentType = $contentTypeOverride ?? $this->request->getHeader('Content-Type');
		if ($contentType !== '') {
			$forwardHeaders[] = 'Content-Type: ' . $contentType;
		}

		$body = $bodyOverride;
		if ($body === null && in_array(strtoupper($method), ['POST', 'PUT', 'PATCH'], true)) {
			$body = $this->readRequestBody(self::MAX_BODY_BYTES);
			if ($body === null) {
				echo "event: error\n";
				echo 'data: {"error":"request_too_large"}' . "\n\n";
				flush();
				exit(0);
			}
		}

		$ch = curl_init();
		curl_setopt($ch, CURLOPT_URL, $url);
		curl_setopt($ch, CURLOPT_CUSTOMREQUEST, strtoupper($method));
		curl_setopt($ch, CURLOPT_RETURNTRANSFER, false);
		curl_setopt($ch, CURLOPT_TIMEOUT, 0);
		curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, self::CONNECT_TIMEOUT_SECONDS);
		// Orca can go quiet for several minutes during heavy meshes; do not
		// abort the upstream SSE when bytes stall (default 120 s was cutting
		// off the final `done` event mid-slice).
		curl_setopt($ch, CURLOPT_LOW_SPEED_LIMIT, 0);
		curl_setopt($ch, CURLOPT_LOW_SPEED_TIME, 0);
		curl_setopt($ch, CURLOPT_HTTPHEADER, $forwardHeaders);
		if ($body !== null && $body !== '') {
			curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
		}
		curl_setopt($ch, CURLOPT_WRITEFUNCTION, function ($ch, $data) {
			if (connection_aborted()) {
				return 0;
			}
			echo $data;
			if (ob_get_level()) {
				ob_flush();
			}
			flush();
			return strlen($data);
		});

		$ok = curl_exec($ch);
		if ($ok === false) {
			$curlError = curl_error($ch);
			$this->logger->error('Slicer SSE proxy cURL error', [
				'error' => $curlError,
				'url' => $url,
			]);
			echo "event: error\n";
			echo 'data: ' . json_encode([
				'message' => $curlError ?: 'upstream stream closed',
				'code' => 'proxy_stream_error',
			], JSON_THROW_ON_ERROR) . "\n\n";
			if (ob_get_level()) {
				ob_flush();
			}
			flush();
		}
		curl_close($ch);
		exit(0);
	}

	private function readRequestBody(int $maxBytes): ?string
	{
		$contentLength = (int) ($this->request->server['CONTENT_LENGTH'] ?? 0);
		if ($contentLength > $maxBytes) {
			return null;
		}

		$fh = fopen('php://input', 'r');
		$body = $fh ? stream_get_contents($fh, $maxBytes + 1) : '';
		if ($fh) {
			fclose($fh);
		}
		if ($body === false) {
			return '';
		}
		if (strlen($body) > $maxBytes) {
			return null;
		}
		return $body;
	}

	private function shouldConvertOctetStreamSlice(string $safePath, string $upstreamPath, string $method): bool
	{
		if (strtoupper($method) !== 'POST' || $upstreamPath !== 'api/slice/stream') {
			return false;
		}
		if ($safePath !== 'slice/stream' && !str_ends_with($safePath, '/slice/stream') && $safePath !== 'api/slice/stream') {
			return false;
		}
		$ct = strtolower(trim(explode(';', $this->request->getHeader('Content-Type') ?: '')[0]));
		return $ct === 'application/octet-stream';
	}

	/**
	 * @return array{body: string, contentType: string}|JSONResponse
	 */
	private function buildSliceMultipartFromOctetStream(): array|JSONResponse
	{
		$modelBody = $this->readRequestBody(self::MAX_BODY_BYTES);
		if ($modelBody === null) {
			return new JSONResponse(
				[
					'message' => 'Request body too large (max 50 MB)',
					'reason' => 'request_too_large',
				],
				Http::STATUS_REQUEST_ENTITY_TOO_LARGE,
			);
		}

		$filename = $this->request->getHeader('X-Filename') ?: 'model.stl';
		$filename = basename(str_replace('\\', '/', $filename));

		$params = [];
		parse_str($this->sanitizeQueryString($this->request->server['QUERY_STRING'] ?? ''), $params);

		$printerId = (string) ($params['printer_id'] ?? '');
		$processId = (string) ($params['process_id'] ?? '');
		$filamentIds = [];
		if (!empty($params['filament_ids'])) {
			$decoded = json_decode((string) $params['filament_ids'], true);
			if (is_array($decoded)) {
				$filamentIds = array_values(array_map('strval', $decoded));
			}
		}
		$overrides = null;
		if (!empty($params['overrides'])) {
			$decoded = json_decode((string) $params['overrides'], true);
			if (is_array($decoded)) {
				$overrides = $decoded;
			}
		}
		$pauses = null;
		if (!empty($params['pauses'])) {
			$decoded = json_decode((string) $params['pauses'], true);
			if (is_array($decoded)) {
				$pauses = $decoded;
			}
		}

		return MultipartBuilder::buildSliceMultipart(
			$modelBody,
			$filename,
			$printerId,
			$filamentIds,
			$processId,
			$overrides,
			$pauses,
		);
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
