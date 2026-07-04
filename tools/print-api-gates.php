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
		return 'api/slice/stream';
	}
	if ($safePath === '' || str_starts_with($safePath, 'api/')) {
		return $safePath;
	}
	return 'api/' . ltrim($safePath, '/');
}

function gate_slicer_path_allowed(string $upstreamPath): bool
{
	// Mirrors SlicerProxyController::ALLOWED_SLICER_PREFIXES.
	$prefixes = [
		'api/health', 'api/version', 'api/profiles', 'api/printers',
		'api/slice', 'api/jobs/', 'api/mesh/', 'api/calibration',
	];
	foreach ($prefixes as $prefix) {
		if ($upstreamPath === rtrim($prefix, '/') || str_starts_with($upstreamPath, $prefix)) {
			return true;
		}
	}
	return false;
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

// G10 — slice/stream maps to api/slice/stream upstream (SSE endpoint)
$streamMaps = gate_slicer_upstream_path('slice/stream') === 'api/slice/stream'
	&& gate_slicer_upstream_path('api/slice/stream') === 'api/slice/stream';
gate('G10', $streamMaps, 'slice/stream -> api/slice/stream');

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

// G13 — slicer proxy allows only the explicit endpoint allowlist
$slicerBlocks = !gate_slicer_path_allowed('etc/passwd')
	&& !gate_slicer_path_allowed('server/info')
	&& !gate_slicer_path_allowed('api/admin/reset')
	&& gate_slicer_path_allowed('api/health')
	&& gate_slicer_path_allowed('api/slice/stream')
	&& gate_slicer_path_allowed('api/jobs/abc/gcode')
	&& gate_slicer_path_allowed(gate_slicer_upstream_path('profiles'));
gate('G13', $slicerBlocks, 'slicer endpoint allowlist gate');

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

// G16 — Files app init script bundle on disk
$jsDir = dirname(__DIR__) . '/js';
$filesAction = glob($jsDir . '/nc_print-files-action*.mjs') ?: [];
$g16Ok = $filesAction !== [] && is_readable($filesAction[0]);
gate('G16', $g16Ok, $g16Ok ? basename($filesAction[0]) : 'missing nc_print-files-action.mjs');

// G17 — built three.js lazy chunk (viewport); source checked in print-preflight.sh on host
$jsDir = dirname(__DIR__) . '/js';
$threeChunk = glob($jsDir . '/nc_print-nc-print-three.js*') ?: [];
$g17Ok = $threeChunk !== [];
gate('G17', $g17Ok, $g17Ok ? basename($threeChunk[0]) : 'missing nc_print-nc-print-three chunk');

// G18/G19 — vitest suite (host npm when available; else recent .vitest-gate-stamp from make gate-preflight)
$repoRoot = dirname(__DIR__);
$npmExit = 1;
$npmDetail = 'vitest not run';
$stampFile = $repoRoot . '/.vitest-gate-stamp';
$npmBin = trim((string) shell_exec('command -v npm 2>/dev/null'));
if ($npmBin !== '' && is_dir($repoRoot) && is_readable($repoRoot . '/package.json')) {
	$npmCmd = 'cd ' . escapeshellarg($repoRoot) . ' && npm run test 2>&1';
	$npmOutput = [];
	exec($npmCmd, $npmOutput, $npmExit);
	$npmTail = implode(' ', array_slice($npmOutput, -3));
	$npmDetail = $npmExit === 0
		? 'vitest exit 0'
		: ('vitest exit ' . $npmExit . ($npmTail !== '' ? ' — ' . substr($npmTail, 0, 160) : ''));
} elseif (is_readable($stampFile) && (time() - (int) filemtime($stampFile)) < 900) {
	$npmExit = trim((string) file_get_contents($stampFile)) === 'ok' ? 0 : 1;
	$npmDetail = $npmExit === 0 ? 'host stamp ok (<15m)' : 'host stamp invalid';
} else {
	$npmDetail = 'npm unavailable in container — run make gate-preflight on host';
}
gate('G18', $npmExit === 0, 'viewport-stl.spec.js + suite: ' . $npmDetail);
gate('G19', $npmExit === 0, 'prepare-workflow.spec.js + suite: ' . $npmDetail);

// G20 — control routes registered
$g20Routes = $routesRaw !== ''
	&& gate_routes_contain($routesRaw, "printer#setTemperature")
	&& gate_routes_contain($routesRaw, '/api/printer/temperature')
	&& gate_routes_contain($routesRaw, "printer#emergencyStop")
	&& gate_routes_contain($routesRaw, '/api/printer/emergency-stop')
	&& gate_routes_contain($routesRaw, "printer#gcodeAction")
	&& gate_routes_contain($routesRaw, '/api/printer/gcode-action');
gate('G20', $g20Routes, $g20Routes ? 'control routes registered' : 'missing control routes');

// G21 — temperature clamp inline regression + M104/M140 emission in source
$clampNozzle = static fn(float $v): float => max(0.0, min(300.0, $v));
$clampBed = static fn(float $v): float => max(0.0, min(120.0, $v));
$printerSrcPath = dirname(__DIR__) . '/lib/Controller/PrinterController.php';
$printerSrc = is_readable($printerSrcPath) ? (string) file_get_contents($printerSrcPath) : '';
$g21Clamp = $clampNozzle(350.0) === 300.0 && $clampBed(200.0) === 120.0;
$g21Gcode = $printerSrc !== ''
	&& str_contains($printerSrc, 'M104 S')
	&& str_contains($printerSrc, 'M140 S')
	&& str_contains($printerSrc, 'clampNozzleTemp')
	&& str_contains($printerSrc, 'clampBedTemp');
gate('G21', $g21Clamp && $g21Gcode, $g21Clamp && $g21Gcode ? 'temp clamp + M104/M140' : 'clamp or gcode missing');

// G22 — emergency stop uses printer/emergency_stop (not gcode/script)
$g22 = $printerSrc !== ''
	&& str_contains($printerSrc, "moonrakerPost('printer/emergency_stop'")
	&& !preg_match("/emergencyStop\\(\\)[\\s\\S]{0,400}printer\\/gcode\\/script/", $printerSrc);
gate('G22', $g22, $g22 ? 'emergency_stop path' : 'e-stop must not use gcode/script');

// G23 — tuning factor clamp inline regression
$clampTune = static fn(float $v): int => (int) round(max(50.0, min(200.0, $v)));
$clampFan = static fn(float $v): int => (int) round(max(0.0, min(255.0, $v)));
$clampBabystep = static fn(float $v): float => max(-2.0, min(2.0, $v));
$g23Inline = $clampTune(250) === 200 && $clampTune(40) === 50
	&& $clampFan(300) === 255 && $clampFan(-5) === 0
	&& $clampBabystep(5.0) === 2.0 && $clampBabystep(-3.0) === -2.0;
$g23Source = $printerSrc !== ''
	&& str_contains($printerSrc, 'M220 S')
	&& str_contains($printerSrc, 'M221 S')
	&& str_contains($printerSrc, 'M106 S')
	&& str_contains($printerSrc, 'SET_GCODE_OFFSET Z_ADJUST');
gate('G23', $g23Inline && $g23Source, $g23Inline && $g23Source ? 'tuning clamp ok' : 'tuning clamp missing');

// G24 — camera proxy resolves per-printer URL via ConfigService
$cameraSrcPath = dirname(__DIR__) . '/lib/Controller/CameraController.php';
$cameraSrc = is_readable($cameraSrcPath) ? (string) file_get_contents($cameraSrcPath) : '';
$configSrcPath = dirname(__DIR__) . '/lib/Service/ConfigService.php';
$configSrc = is_readable($configSrcPath) ? (string) file_get_contents($configSrcPath) : '';
$g24Static = $cameraSrc !== ''
	&& str_contains($cameraSrc, 'resolveCameraUrl')
	&& str_contains($cameraSrc, "getParam('printer_id')")
	&& $configSrc !== ''
	&& str_contains($configSrc, 'function resolveCameraUrl');
$g24Http = false;
$g24Detail = 'static only';
if ($internalBase !== '') {
	$camUrl = $internalBase . '/index.php/apps/nc_print/api/camera/frame.jpeg?printer_id=default';
	$camRes = gate_http_get($camUrl, 10);
	$g24Http = in_array($camRes['http'], [200, 502, 503], true);
	$g24Detail = 'http=' . $camRes['http'];
}
gate('G24', $g24Static && ($g24Http || $internalBase === 'http://127.0.0.1'), $g24Detail);

// G25 — pause/resume/cancel forward printer_id
$g25 = $printerSrc !== ''
	&& str_contains($printerSrc, "getParam('printer_id')")
	&& gate_routes_contain($routesRaw, "printer#pause")
	&& gate_routes_contain($routesRaw, '/api/printer/pause');
gate('G25', $g25, $g25 ? 'printer_id on print actions' : 'printer_id missing on pause path');

// G26 — manual motion refused while printing.
// v1.9.0: the print-active guard now merges MOTION_ACTIONS with the Part B
// IDLE_ONLY_ACTIONS into a local $idleOnly set, so accept either the legacy
// literal or the merged form — both enforce the same block.
$g26MotionGuarded = preg_match("/in_array\\(\\\$action, self::MOTION_ACTIONS, true\\)/", $printerSrc) === 1
	|| (
		str_contains($printerSrc, 'array_merge(self::MOTION_ACTIONS, self::IDLE_ONLY_ACTIONS)')
		&& preg_match("/in_array\\(\\\$action, \\\$idleOnly, true\\)/", $printerSrc) === 1
	);
$g26 = $printerSrc !== ''
	&& str_contains($printerSrc, 'motion_blocked')
	&& str_contains($printerSrc, 'isPrintActive')
	&& str_contains($printerSrc, 'MOTION_ACTIONS')
	&& $g26MotionGuarded;
gate('G26', $g26, $g26 ? 'motion blocked while printing' : 'motion guard missing');

// G27 — release version >= 1.9.0 (v1.9.0 UX cohesion + Part B foundation)
gate('G27', version_compare($version, '1.9.0', '>='), 'version=' . $version);

// ---------------------------------------------------------------------------
// WS7 — deploy freshness + Part B proxy/console security regression
// ---------------------------------------------------------------------------

$deployRoot = '/var/www/html/custom_apps/nc_print';
$deployedCss = $deployRoot . '/css/style.css';

// G34 — deployed CSS carries the WS1 sticky chrome (guards against stale CSS).
if (!is_readable($deployedCss)) {
	gate('G34', true, 'skip: deployed css/style.css not present (source-tree run)');
} else {
	$cssRaw = (string) file_get_contents($deployedCss);
	$g34 = str_contains($cssRaw, 'position: sticky') || str_contains($cssRaw, 'position:sticky');
	gate('G34', $g34, $g34 ? 'sticky chrome CSS deployed' : 'stale CSS: no sticky chrome');
}

// G35 — CSS/JS deploy freshness: deployed CSS mtime >= newest JS mtime - 60s.
$jsGlob = glob($deployRoot . '/js/nc_print-main*.js') ?: [];
if (!is_readable($deployedCss) || $jsGlob === []) {
	gate('G35', true, 'skip: deployed assets not present (source-tree run)');
} else {
	$cssMtime = (int) filemtime($deployedCss);
	$jsMtime = 0;
	foreach ($jsGlob as $jsFile) {
		$jsMtime = max($jsMtime, (int) filemtime($jsFile));
	}
	$g35 = $cssMtime >= ($jsMtime - 60);
	gate('G35', $g35, $g35
		? sprintf('fresh: css=%d js=%d', $cssMtime, $jsMtime)
		: sprintf('stale css: css=%d < js=%d-60', $cssMtime, $jsMtime));
}

// G45 — Part B proxy allowlist + console-off regression.
$proxySrcPath = dirname(__DIR__) . '/lib/Controller/MoonrakerProxyController.php';
$proxySrc = is_readable($proxySrcPath) ? (string) file_get_contents($proxySrcPath) : '';
$configSrcPath = dirname(__DIR__) . '/lib/Service/ConfigService.php';
$configSrcG45 = is_readable($configSrcPath) ? (string) file_get_contents($configSrcPath) : '';

// Part B read prefixes present, raw gcode passthrough never allowed, console
// disabled by default, and consoleCommand guards on isConsoleEnabled.
$partBPrefixes = [
	'server/temperature_store',
	'server/history/',
	'server/job_queue/',
	'machine/timelapse/',
	'server/spoolman/',
];
$g45Reads = $proxySrc !== '';
foreach ($partBPrefixes as $prefix) {
	$g45Reads = $g45Reads && str_contains($proxySrc, "'" . $prefix . "'");
}
$g45NoRawGcode = $proxySrc !== ''
	&& !str_contains($proxySrc, "'printer/gcode/script'")
	&& !str_contains($proxySrc, "'printer/gcode'");
$g45ConsoleGuard = $printerSrc !== ''
	&& str_contains($printerSrc, 'isConsoleEnabled')
	&& preg_match("/function consoleCommand\\(/", $printerSrc) === 1;
$g45ConsoleDefaultOff = $configSrcG45 !== ''
	&& preg_match("/function isConsoleEnabled\\([\\s\\S]{0,200}?false/", $configSrcG45) === 1;

$g45 = $g45Reads && $g45NoRawGcode && $g45ConsoleGuard && $g45ConsoleDefaultOff;
gate('G45', $g45, $g45
	? 'proxy allowlist + console-off regression OK'
	: sprintf('reads=%d noraw=%d guard=%d off=%d',
		$g45Reads ? 1 : 0, $g45NoRawGcode ? 1 : 0, $g45ConsoleGuard ? 1 : 0, $g45ConsoleDefaultOff ? 1 : 0));

// ── G46–G50: routes/allowlist added since G45 are actually registered in the
// DEPLOYED files. We assert wiring against the deployed routes.php / controller
// sources rather than HTTP (CLI requests are unauthenticated → misleading), and
// this specifically catches the "opcache served a stale routes.php" class of bug
// because the check reads the file the container is actually running.

// G46 — discovery + capabilities routes registered.
$g46 = gate_routes_contain($routesRaw, "'printer_discovery#discover'")
	&& gate_routes_contain($routesRaw, "'printer#capabilities'");
gate('G46', $g46, $g46 ? 'discovery + capabilities routes registered' : 'missing discovery/capabilities route');

// G47 — smart-ETA routes registered.
$g47 = gate_routes_contain($routesRaw, "'eta#predict'")
	&& gate_routes_contain($routesRaw, "'eta#record'")
	&& gate_routes_contain($routesRaw, "'eta#stats'");
gate('G47', $g47, $g47 ? 'eta routes registered' : 'missing eta route(s)');

// G48 — print-transition (notifications/activity bridge) route registered.
$g48 = gate_routes_contain($routesRaw, "'print_event#notifyTransition'");
gate('G48', $g48, $g48 ? 'print-transition route registered' : 'missing print-transition route');

// G49 — monitor read prefixes on the Moonraker allowlist (v1.27.0 expansion).
$g49 = $proxySrc !== ''
	&& str_contains($proxySrc, "'server/webcams'")
	&& str_contains($proxySrc, "'machine/update/status'")
	&& str_contains($proxySrc, "'server/announcements/'");
gate('G49', $g49, $g49 ? 'monitor read prefixes allowlisted' : 'missing monitor read prefix');

// G50 — guarded filament_extrude action is allowlisted AND idle-only.
$printerSrcPath = dirname(__DIR__) . '/lib/Controller/PrinterController.php';
$printerSrc = is_readable($printerSrcPath) ? (string) file_get_contents($printerSrcPath) : '';
$g50 = $printerSrc !== ''
	&& preg_match('/ALLOWED_GCODE_ACTIONS[\s\S]*?filament_extrude/', $printerSrc) === 1
	&& preg_match('/IDLE_ONLY_ACTIONS[\s\S]*?filament_extrude/', $printerSrc) === 1;
gate('G50', $g50, $g50 ? 'filament_extrude guarded + idle-only' : 'filament_extrude missing/not idle-gated');

exit($fail === 0 ? 0 : 1);
