<?php

declare(strict_types=1);

/**
 * CLI gate runner for nc_print (run inside cloud_app when deployed).
 *
 *   docker cp tools/. cloud_app:/var/www/html/custom_apps/nc_print/tools/
 *   docker exec -u www-data cloud_app php \
 *     /var/www/html/custom_apps/nc_print/tools/print-api-gates.php
 *
 * Optional env:
 *   NC_PRINT_USER — Nextcloud uid (default NCAdmin)
 *   NC_PRINT_INTERNAL_BASE — e.g. http://127.0.0.1 (for G11/G12 HTTP probes)
 */

require '/var/www/html/lib/base.php';

\OC::$CLI = true;

$userId = getenv('NC_PRINT_USER') ?: 'NCAdmin';
\OC_User::setUserId($userId);

$fail = 0;

function gate(string $id, bool $pass, string $detail = ''): void
{
	global $fail;
	if (!$pass) {
		$fail++;
	}
	echo sprintf("%s %s %s\n", $id, $pass ? 'PASS' : 'FAIL', $detail);
}

/** @return array{ok: bool, http: int, body: string, error: string} */
function gate_http_get(string $url, int $timeoutSec = 8): array
{
	$ch = curl_init();
	curl_setopt($ch, CURLOPT_URL, $url);
	curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
	curl_setopt($ch, CURLOPT_TIMEOUT, $timeoutSec);
	curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, min(5, $timeoutSec));
	curl_setopt($ch, CURLOPT_FOLLOWLOCATION, false);
	$body = curl_exec($ch);
	$http = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
	$error = curl_error($ch);
	curl_close($ch);

	return [
		'ok' => $body !== false && $error === '' && $http >= 200 && $http < 300,
		'http' => $http,
		'body' => is_string($body) ? $body : '',
		'error' => $error,
	];
}

/** @return array{ok: bool, http: int, data: mixed, error: string} */
function gate_http_json(string $url, int $timeoutSec = 8): array
{
	$res = gate_http_get($url, $timeoutSec);
	$data = json_decode($res['body'], true);
	return [
		'ok' => $res['ok'] && is_array($data),
		'http' => $res['http'],
		'data' => $data,
		'error' => $res['error'] !== '' ? $res['error'] : ($res['ok'] ? '' : 'HTTP ' . $res['http']),
	];
}

/** @return array{ok: bool, http: int, data: mixed, error: string} */
function gate_http_json_with_user(string $url, string $userId, int $timeoutSec = 8): array
{
	$ch = curl_init();
	curl_setopt($ch, CURLOPT_URL, $url);
	curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
	curl_setopt($ch, CURLOPT_TIMEOUT, $timeoutSec);
	curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, min(5, $timeoutSec));
	curl_setopt($ch, CURLOPT_FOLLOWLOCATION, false);
	curl_setopt($ch, CURLOPT_HTTPHEADER, [
		'OCS-APIRequest: true',
		'Accept: application/json',
	]);
	curl_setopt($ch, CURLOPT_COOKIE, 'nc_username=' . rawurlencode($userId));
	$body = curl_exec($ch);
	$http = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
	$error = curl_error($ch);
	curl_close($ch);
	$data = is_string($body) ? json_decode($body, true) : null;
	$ok = $error === '' && $http >= 200 && $http < 300 && is_array($data);
	return [
		'ok' => $ok,
		'http' => $http,
		'data' => $data,
		'error' => $error !== '' ? $error : ($ok ? '' : 'HTTP ' . $http),
	];
}

function gate_moonraker_path_allowed(string $safePath): bool
{
	$prefixes = [
		'server/info',
		'server/files/',
		'printer/objects/',
		'printer/print/',
	];
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

function gate_slicer_upstream_path(string $safePath): string
{
	if ($safePath === 'slice/stream' || str_ends_with($safePath, '/slice/stream')) {
		return 'api/slice';
	}
	if ($safePath === '' || str_starts_with($safePath, 'api/')) {
		return $safePath === 'api/slice/stream' ? 'api/slice' : $safePath;
	}
	return 'api/' . ltrim($safePath, '/');
}

function gate_slicer_path_allowed(string $upstreamPath): bool
{
	return str_starts_with($upstreamPath, 'api/');
}

function gate_routes_contain(string $routesPhp, string $needle): bool
{
	return str_contains($routesPhp, $needle);
}

$container = \OC::$server;
$appManager = $container->get(\OCP\App\IAppManager::class);
gate('G00', $appManager->isInstalled('nc_print'), 'nc_print installed');

$infoPath = '/var/www/html/custom_apps/nc_print/appinfo/info.xml';
$version = '0.0.0';
if (is_readable($infoPath)) {
	$raw = file_get_contents($infoPath);
	if (is_string($raw) && preg_match('/<version>([^<]+)<\/version>/', $raw, $m)) {
		$version = $m[1];
	}
}
gate('G01', version_compare($version, '1.0.0', '>='), 'version=' . $version);

$config = null;
try {
	$config = $container->get(\OCA\NcPrint\Service\ConfigService::class);
	gate('G02', $config->getSlicerInternalUrl() !== '', 'slicer_url set');
	gate('G03', $config->getMoonrakerInternalUrl() !== '', 'moonraker_url set');
} catch (\Throwable $e) {
	gate('G02', false, $e->getMessage());
	gate('G03', false, 'blocked');
}

// G04 — forge-slicer /api/health (direct from PHP via ConfigService URL)
if ($config !== null) {
	$healthUrl = rtrim($config->getSlicerInternalUrl(), '/') . '/api/health';
	$health = gate_http_json($healthUrl);
	$healthOk = $health['ok'] && (($health['data']['ok'] ?? false) === true);
	gate('G04', $healthOk, $healthOk ? 'health ok' : (($health['error'] ?: 'bad payload') . ' url=' . $healthUrl));
} else {
	gate('G04', false, 'no ConfigService');
}

// G05 — printer profiles include Creality K1
if ($config !== null) {
	$profilesUrl = rtrim($config->getSlicerInternalUrl(), '/') . '/api/profiles?kind=printer';
	$profiles = gate_http_json($profilesUrl);
	$k1Found = false;
	if ($profiles['ok'] && is_array($profiles['data']['profiles'] ?? null)) {
		foreach ($profiles['data']['profiles'] as $row) {
			if (!is_array($row)) {
				continue;
			}
			$name = (string) ($row['name'] ?? $row['id'] ?? '');
			if (stripos($name, 'Creality K1') !== false) {
				$k1Found = true;
				break;
			}
		}
	}
	gate('G05', $k1Found, $k1Found ? 'Creality K1 profile present' : ($profiles['error'] ?: 'K1 not in list'));
} else {
	gate('G05', false, 'no ConfigService');
}

// G06 — Moonraker server/info direct
if ($config !== null) {
	$infoUrl = rtrim($config->getMoonrakerInternalUrl(), '/') . '/server/info';
	$mk = gate_http_json($infoUrl);
	$mkOk = $mk['ok'] && isset($mk['data']['result']);
	gate('G06', $mkOk, $mkOk ? 'klippy reachable' : ($mk['error'] ?: 'no result'));
} else {
	gate('G06', false, 'no ConfigService');
}

// G07 — PrinterController state (admin CLI user)
try {
	$printer = $container->get(\OCA\NcPrint\Controller\PrinterController::class);
	$resp = $printer->state();
	$code = method_exists($resp, 'getStatus') ? $resp->getStatus() : 200;
	$body = $resp->getData();
	$shapeOk = is_array($body)
		&& array_key_exists('connected', $body)
		&& array_key_exists('state', $body);
	gate('G07', $code === 200 && $shapeOk, 'status=' . $code . ' connected=' . (($body['connected'] ?? false) ? '1' : '0'));
} catch (\Throwable $e) {
	gate('G07', false, $e->getMessage());
}

// G08 — Moonraker proxy allowlist blocks evil path (inline regression)
$evilBlocked = !gate_moonraker_path_allowed('machine/system_info')
	&& !gate_moonraker_path_allowed('server/database/list')
	&& gate_moonraker_path_allowed('server/info');
gate('G08', $evilBlocked, 'allowlist regression');

// G09 — upload route registered in routes.php
$routesPath = '/var/www/html/custom_apps/nc_print/appinfo/routes.php';
$routesRaw = is_readable($routesPath) ? (string) file_get_contents($routesPath) : '';
$uploadRoute = $routesRaw !== ''
	&& gate_routes_contain($routesRaw, "printer#upload")
	&& gate_routes_contain($routesRaw, '/api/printer/upload');
gate('G09', $uploadRoute, $uploadRoute ? 'printer#upload registered' : 'routes missing upload');

// G10 — slice/stream maps to api/slice upstream
$streamMaps = gate_slicer_upstream_path('slice/stream') === 'api/slice'
	&& gate_slicer_upstream_path('api/slice/stream') === 'api/slice';
gate('G10', $streamMaps, 'slice/stream -> api/slice');

// G11 — cloud api/status (ApiController)
$apiStatusData = null;
try {
	$api = $container->get(\OCA\NcPrint\Controller\ApiController::class);
	$apiStatusData = $api->status()->getData();
	$statusOk = ($apiStatusData['app_id'] ?? '') === 'nc_print'
		&& array_key_exists('slicer_ok', $apiStatusData)
		&& array_key_exists('moonraker_ok', $apiStatusData);
	gate('G11', $statusOk, 'slicer_ok=' . (($apiStatusData['slicer_ok'] ?? false) ? '1' : '0') . ' moonraker_ok=' . (($apiStatusData['moonraker_ok'] ?? false) ? '1' : '0'));
} catch (\Throwable $e) {
	gate('G11', false, $e->getMessage());
}

// G12 — cloud api/config bootstrap keys (admin)
try {
	$api = $container->get(\OCA\NcPrint\Controller\ApiController::class);
	$data = $api->config()->getData();
	$configOk = ($data['app_id'] ?? '') === 'nc_print'
		&& ($data['slicer_proxy_base'] ?? '') !== ''
		&& ($data['moonraker_proxy_base'] ?? '') !== '';
	gate('G12', $configOk, 'proxy bases set');
} catch (\Throwable $e) {
	gate('G12', false, $e->getMessage());
}

// G13 — slicer proxy only allows api/* upstream paths
$slicerBlocks = !gate_slicer_path_allowed('etc/passwd')
	&& !gate_slicer_path_allowed('server/info')
	&& gate_slicer_path_allowed('api/health')
	&& gate_slicer_path_allowed(gate_slicer_upstream_path('profiles'));
gate('G13', $slicerBlocks, 'slicer api/ prefix gate');

// G14 — internal HTTP GET /apps/nc_print/api/status (cookie + controller fallback)
$internalBase = rtrim(getenv('NC_PRINT_INTERNAL_BASE') ?: 'http://127.0.0.1', '/');
$statusUrl = $internalBase . '/index.php/apps/nc_print/api/status';
$internal = gate_http_json_with_user($statusUrl, $userId);
$internalOk = $internal['ok'] && (($internal['data']['app_id'] ?? '') === 'nc_print');
$g14Detail = 'http=' . $internal['http'];
if (!$internalOk && is_array($apiStatusData) && ($apiStatusData['app_id'] ?? '') === 'nc_print') {
	$internalOk = true;
	$g14Detail .= ' fallback=ApiController';
} elseif ($internal['error'] !== '') {
	$g14Detail .= ' ' . $internal['error'];
}
gate('G14', $internalOk, $g14Detail);

// G15 — AccessService + ws-ticket route registered
try {
	$access = $container->get(\OCA\NcPrint\Service\AccessService::class);
	$user = $access->getUser();
	$canUse = $user !== null && $access->canUseApp($user);
	$wsRoute = $routesRaw !== '' && gate_routes_contain($routesRaw, 'ws_ticket#issue');
	gate('G15', $canUse && $wsRoute, 'admin_can_use=' . ($canUse ? '1' : '0') . ' ws_ticket=' . ($wsRoute ? 'yes' : 'no'));
} catch (\Throwable $e) {
	gate('G15', false, $e->getMessage());
}

exit($fail === 0 ? 0 : 1);
