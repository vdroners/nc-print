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

	private const NOZZLE_TEMP_MIN = 0;
	private const NOZZLE_TEMP_MAX = 300;
	private const BED_TEMP_MIN = 0;
	private const BED_TEMP_MAX = 120;
	private const TUNE_FACTOR_MIN = 50;
	private const TUNE_FACTOR_MAX = 200;
	private const FAN_SPEED_MIN = 0;
	private const FAN_SPEED_MAX = 255;
	private const BABYSTEP_Z_MIN = -2.0;
	private const BABYSTEP_Z_MAX = 2.0;
	private const JOG_DISTANCE_MIN = -10.0;
	private const JOG_DISTANCE_MAX = 10.0;

	private const CONSOLE_CMD_MAX_LEN = 256;

	/** @var list<string> */
	private const MOTION_ACTIONS = ['home_all', 'home_z', 'jog', 'disable_steppers'];

	/**
	 * Actions that must NOT run while a print is active (idle-only), in
	 * addition to MOTION_ACTIONS. Part B guarded writes (WS12/WS14).
	 * @var list<string>
	 */
	private const IDLE_ONLY_ACTIONS = [
		'bed_mesh_calibrate',
		'filament_load',
		'filament_unload',
		'filament_purge',
		'pid_calibrate',
	];

	/** @var list<string> */
	private const ALLOWED_GCODE_ACTIONS = [
		'tune_speed',
		'tune_flow',
		'tune_fan',
		'babystep_z',
		'home_all',
		'home_z',
		'jog',
		'disable_steppers',
		// Part B guarded writes (WS12/WS13/WS14). Each maps to a fixed,
		// parameterised script below — never a raw passthrough.
		'bed_mesh_calibrate',
		'exclude_object',
		'filament_load',
		'filament_unload',
		'filament_purge',
		'set_heater_temp',
		'pid_calibrate',
	];

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
				'virtual_sdcard' => null,
				'extruder' => null,
				'heater_bed' => null,
				'fan' => null,
				'gcode_move' => null,
				'toolhead' => null,
			],
		], JSON_THROW_ON_ERROR);

		$result = $this->moonrakerPost('printer/objects/query', $payload, 'application/json', $this->request->getParam('printer_id'));
		if ($result === null) {
			return new JSONResponse($this->emptyState('Moonraker unreachable'));
		}

		$status = $result['status'] ?? $result['result']['status'] ?? [];
		return new JSONResponse($this->normalizeState($status));
	}

	/**
	 * Detect a printer's real capabilities live from Moonraker/Klipper:
	 * build volume (toolhead.axis_maximum), extruder count, and machine model /
	 * firmware (machine.system_info). Read-only. Used to auto-populate the picker
	 * capability chips when a printer is selected/added.
	 */
	#[NoCSRFRequired]
	#[NoAdminRequired]
	public function capabilities(): JSONResponse
	{
		if (!$this->access->canUseApp()) {
			return new JSONResponse($this->access->forbiddenJsonPayload(), Http::STATUS_FORBIDDEN);
		}
		if (!$this->config->isMoonrakerEnabled()) {
			return new JSONResponse(['ok' => false, 'capabilities' => null,
				'message' => 'Moonraker integration disabled']);
		}
		$printerId = $this->request->getParam('printer_id');

		// toolhead gives axis_maximum (build volume) + extruder count hints;
		// gcode_move / configfile are queried where present.
		$objectsPayload = json_encode([
			'objects' => ['toolhead' => null, 'configfile' => null],
		], JSON_THROW_ON_ERROR);
		$objects = $this->moonrakerPost('printer/objects/query', $objectsPayload, 'application/json', $printerId);
		$status = $objects['status'] ?? $objects['result']['status'] ?? [];

		// machine/system_info is GET-only in Moonraker (POST -> 405).
		$sys = $this->moonrakerGet('machine/system_info', $printerId);
		$systemInfo = $sys['system_info'] ?? $sys['result']['system_info'] ?? [];

		$caps = self::normalizeCapabilities($status, $systemInfo);
		if ($caps === null) {
			return new JSONResponse(['ok' => false, 'capabilities' => null,
				'message' => 'Printer unreachable or reported no capabilities']);
		}
		return new JSONResponse(['ok' => true, 'capabilities' => $caps]);
	}

	/**
	 * Pure capability normalizer (unit-tested). Maps a Moonraker
	 * printer.objects `status` + machine.system_info block into a compact,
	 * UI-friendly shape. Missing fields are tolerated (returned null).
	 *
	 * @param array<string, mixed> $status
	 * @param array<string, mixed> $systemInfo
	 * @return array<string, mixed>|null
	 */
	public static function normalizeCapabilities(array $status, array $systemInfo): ?array
	{
		$out = [];

		$toolhead = is_array($status['toolhead'] ?? null) ? $status['toolhead'] : [];
		$axisMax = $toolhead['axis_maximum'] ?? null; // [x, y, z(, e)]
		$axisMin = $toolhead['axis_minimum'] ?? null;
		if (is_array($axisMax) && isset($axisMax[0], $axisMax[1], $axisMax[2])) {
			$minX = is_array($axisMin) && isset($axisMin[0]) ? (float) $axisMin[0] : 0.0;
			$minY = is_array($axisMin) && isset($axisMin[1]) ? (float) $axisMin[1] : 0.0;
			$minZ = is_array($axisMin) && isset($axisMin[2]) ? (float) $axisMin[2] : 0.0;
			$out['build_volume'] = [
				'x' => (int) round((float) $axisMax[0] - $minX),
				'y' => (int) round((float) $axisMax[1] - $minY),
				'z' => (int) round((float) $axisMax[2] - $minZ),
			];
		}

		// Extruder count: Klipper exposes extruder, extruder1, extruder2, ...
		// as separate config sections; count them from the configfile settings
		// if present, else infer 1 when a toolhead exists.
		$configfile = is_array($status['configfile'] ?? null) ? $status['configfile'] : [];
		$settings = is_array($configfile['settings'] ?? null) ? $configfile['settings'] : [];
		$extruders = 0;
		foreach (array_keys($settings) as $section) {
			if ($section === 'extruder' || preg_match('/^extruder\d+$/', (string) $section)) {
				$extruders++;
			}
		}
		if ($extruders === 0 && $toolhead !== []) {
			$extruders = 1;
		}
		if ($extruders > 0) {
			$out['extruders'] = $extruders;
		}

		// Enclosure heuristic: a chamber heater/temperature section implies one.
		foreach (array_keys($settings) as $section) {
			$s = (string) $section;
			if (str_contains($s, 'chamber') || $s === 'temperature_sensor chamber') {
				$out['has_enclosure'] = true;
				break;
			}
		}

		// Machine model / OS from system_info where Moonraker provides it. Model
		// often lives under cpu_info (hardware_desc / cpu_desc / model); many
		// controller boards leave these blank, which we tolerate.
		$distro = is_array($systemInfo['distribution'] ?? null) ? $systemInfo['distribution'] : [];
		$cpu = is_array($systemInfo['cpu_info'] ?? null) ? $systemInfo['cpu_info'] : [];
		foreach ([$systemInfo['model'] ?? '', $cpu['hardware_desc'] ?? '', $cpu['cpu_desc'] ?? '', $cpu['model'] ?? ''] as $cand) {
			if (is_string($cand) && trim($cand) !== '') {
				$out['model'] = trim($cand);
				break;
			}
		}
		if (isset($distro['name']) && is_string($distro['name']) && $distro['name'] !== '') {
			$out['os'] = $distro['name'];
		}

		return $out === [] ? null : $out;
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
	public function setTemperature(): JSONResponse
	{
		if ($gate = $this->controlGate()) {
			return $gate;
		}

		$params = $this->mergedParams();
		$printerId = $this->printerIdFromParams($params);
		// Require numeric values — a non-numeric would cast to 0.0/NaN and
		// silently send M104 S0 (unintended heater shutdown), so reject it.
		$hasNozzle = array_key_exists('nozzle', $params) && $params['nozzle'] !== '' && $params['nozzle'] !== null;
		$hasBed = array_key_exists('bed', $params) && $params['bed'] !== '' && $params['bed'] !== null;
		if (($hasNozzle && !is_numeric($params['nozzle'])) || ($hasBed && !is_numeric($params['bed']))) {
			return new JSONResponse(
				['error' => 'invalid_target', 'message' => 'Temperature values must be numeric'],
				Http::STATUS_BAD_REQUEST,
			);
		}
		if (!$hasNozzle && !$hasBed) {
			return new JSONResponse(
				['error' => 'missing_target', 'message' => 'At least one of nozzle or bed temperature is required'],
				Http::STATUS_BAD_REQUEST,
			);
		}

		$lines = [];
		if ($hasNozzle) {
			$nozzle = $this->clampNozzleTemp((float) $params['nozzle']);
			$lines[] = sprintf('M104 S%d', (int) round($nozzle));
		}
		if ($hasBed) {
			$bed = $this->clampBedTemp((float) $params['bed']);
			$lines[] = sprintf('M140 S%d', (int) round($bed));
		}

		$result = $this->sendGcodeScript(implode("\n", $lines), $printerId);
		if ($result === null) {
			return new JSONResponse(
				['error' => 'backend_unreachable', 'message' => 'Moonraker temperature request failed'],
				Http::STATUS_BAD_GATEWAY,
			);
		}

		return new JSONResponse($result);
	}

	#[NoCSRFRequired]
	#[NoAdminRequired]
	public function emergencyStop(): JSONResponse
	{
		if ($gate = $this->controlGate()) {
			return $gate;
		}

		$printerId = $this->printerIdFromParams($this->mergedParams());
		$result = $this->moonrakerPost('printer/emergency_stop', '{}', 'application/json', $printerId);
		if ($result === null) {
			return new JSONResponse(
				['error' => 'backend_unreachable', 'message' => 'Moonraker emergency stop failed'],
				Http::STATUS_BAD_GATEWAY,
			);
		}

		return new JSONResponse($result);
	}

	#[NoCSRFRequired]
	#[NoAdminRequired]
	public function gcodeAction(): JSONResponse
	{
		if ($gate = $this->controlGate()) {
			return $gate;
		}

		$params = $this->mergedParams();
		$printerId = $this->printerIdFromParams($params);
		$action = strtolower(trim((string) ($params['action'] ?? '')));
		if ($action === '' || !in_array($action, self::ALLOWED_GCODE_ACTIONS, true)) {
			return new JSONResponse(
				['error' => 'invalid_action', 'message' => 'Unsupported gcode action'],
				Http::STATUS_BAD_REQUEST,
			);
		}

		$idleOnly = array_merge(self::MOTION_ACTIONS, self::IDLE_ONLY_ACTIONS);
		if (in_array($action, $idleOnly, true) && $this->isPrintActive($printerId)) {
			return new JSONResponse(
				['error' => 'motion_blocked', 'message' => 'This action is not allowed while a print is active'],
				Http::STATUS_CONFLICT,
			);
		}

		$script = $this->buildGcodeScriptForAction($action, $params);
		if ($script === null) {
			return new JSONResponse(
				['error' => 'invalid_params', 'message' => 'Invalid or missing parameters for action'],
				Http::STATUS_BAD_REQUEST,
			);
		}

		$result = $this->sendGcodeScript($script, $printerId);
		if ($result === null) {
			return new JSONResponse(
				['error' => 'backend_unreachable', 'message' => 'Moonraker gcode request failed'],
				Http::STATUS_BAD_GATEWAY,
			);
		}

		return new JSONResponse($result);
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
		$result = $this->moonrakerPost('server/files/upload', $built['body'], $built['contentType'], $this->request->getParam('printer_id'));
		if ($result === null) {
			return new JSONResponse(
				['error' => 'backend_unreachable', 'message' => 'Moonraker upload failed'],
				Http::STATUS_BAD_GATEWAY,
			);
		}

		return new JSONResponse($result);
	}

	private function controlGate(): ?JSONResponse
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
		return null;
	}

	/** @param array<string, mixed> $params */
	private function printerIdFromParams(array $params): ?string
	{
		$id = $params['printer_id'] ?? $this->request->getParam('printer_id');
		if ($id === null || $id === '') {
			return null;
		}
		return (string) $id;
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

	private function printAction(string $path): JSONResponse
	{
		if ($gate = $this->controlGate()) {
			return $gate;
		}

		$result = $this->moonrakerPost($path, '{}', 'application/json', $this->request->getParam('printer_id'));
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
		$virtualSdcard = is_array($status['virtual_sdcard'] ?? null) ? $status['virtual_sdcard'] : [];
		$extruder = is_array($status['extruder'] ?? null) ? $status['extruder'] : [];
		$bed = is_array($status['heater_bed'] ?? null) ? $status['heater_bed'] : [];
		$fan = is_array($status['fan'] ?? null) ? $status['fan'] : [];
		$gcodeMove = is_array($status['gcode_move'] ?? null) ? $status['gcode_move'] : [];
		$toolhead = is_array($status['toolhead'] ?? null) ? $status['toolhead'] : [];
		$info = is_array($printStats['info'] ?? null) ? $printStats['info'] : [];

		$state = (string) ($printStats['state'] ?? 'unknown');
		$progress = $this->normalizeProgress(
			$virtualSdcard['progress'] ?? null,
			$display['progress'] ?? null,
		);

		$printDuration = $printStats['print_duration'] ?? $info['print_duration'] ?? null;
		$totalDuration = $printStats['total_duration'] ?? $info['total_duration'] ?? null;
		$fanSpeed = isset($fan['speed']) ? (float) $fan['speed'] : null;
		$speedFactor = isset($gcodeMove['speed_factor']) ? (float) $gcodeMove['speed_factor'] : null;
		$flowFactor = isset($gcodeMove['extrude_factor']) ? (float) $gcodeMove['extrude_factor'] : null;
		$zOffset = isset($toolhead['homing_origin']) && is_array($toolhead['homing_origin']) && isset($toolhead['homing_origin'][2])
			? (float) $toolhead['homing_origin'][2]
			: null;

		return [
			'connected' => true,
			'state' => $state,
			'progress' => $progress,
			'extruder_temp' => isset($extruder['temperature']) ? (float) $extruder['temperature'] : null,
			'extruder_target' => isset($extruder['target']) ? (float) $extruder['target'] : null,
			'extruder_power' => isset($extruder['power']) ? (float) $extruder['power'] : null,
			'bed_temp' => isset($bed['temperature']) ? (float) $bed['temperature'] : null,
			'bed_target' => isset($bed['target']) ? (float) $bed['target'] : null,
			'bed_power' => isset($bed['power']) ? (float) $bed['power'] : null,
			'fan_speed' => $fanSpeed,
			'speed_factor' => $speedFactor,
			'flow_factor' => $flowFactor,
			'z_offset' => $zOffset,
			'message' => (string) ($display['message'] ?? ''),
			'filename' => $printStats['filename'] ?? null,
			'print_duration' => is_numeric($printDuration) ? (float) $printDuration : null,
			'total_duration' => is_numeric($totalDuration) ? (float) $totalDuration : null,
			'layer' => isset($virtualSdcard['layer']) ? (int) $virtualSdcard['layer'] : null,
			'layer_count' => isset($virtualSdcard['layer_count']) ? (int) $virtualSdcard['layer_count'] : null,
		];
	}

	private function normalizeProgress(mixed $primary, mixed $fallback): float
	{
		foreach ([$primary, $fallback] as $value) {
			if (!is_numeric($value)) {
				continue;
			}
			$progress = (float) $value;
			if ($progress <= 0.0) {
				continue;
			}
			if ($progress > 1.0) {
				$progress = min(1.0, $progress / 100.0);
			}
			return $progress;
		}

		return 0.0;
	}

	private function clampNozzleTemp(float $value): float
	{
		return max(self::NOZZLE_TEMP_MIN, min(self::NOZZLE_TEMP_MAX, $value));
	}

	private function clampBedTemp(float $value): float
	{
		return max(self::BED_TEMP_MIN, min(self::BED_TEMP_MAX, $value));
	}

	private function clampTuneFactor(float $value): int
	{
		return (int) round(max(self::TUNE_FACTOR_MIN, min(self::TUNE_FACTOR_MAX, $value)));
	}

	private function clampFanSpeed(float $value): int
	{
		return (int) round(max(self::FAN_SPEED_MIN, min(self::FAN_SPEED_MAX, $value)));
	}

	private function clampBabystepZ(float $value): float
	{
		return max(self::BABYSTEP_Z_MIN, min(self::BABYSTEP_Z_MAX, $value));
	}

	private function clampJogDistance(float $value): float
	{
		return max(self::JOG_DISTANCE_MIN, min(self::JOG_DISTANCE_MAX, $value));
	}

	private function isPrintActive(?string $printerId): bool
	{
		$payload = json_encode([
			'objects' => ['print_stats' => null],
		], JSON_THROW_ON_ERROR);
		$result = $this->moonrakerPost('printer/objects/query', $payload, 'application/json', $printerId);
		if ($result === null) {
			return true;
		}
		$status = $result['status'] ?? $result['result']['status'] ?? [];
		$printStats = is_array($status['print_stats'] ?? null) ? $status['print_stats'] : [];
		$state = strtolower((string) ($printStats['state'] ?? ''));
		return in_array($state, ['printing', 'paused'], true);
	}

	/** @return array<string, mixed>|null */
	private function sendGcodeScript(string $script, ?string $printerId): ?array
	{
		$body = json_encode(['script' => $script], JSON_THROW_ON_ERROR);
		return $this->moonrakerPost('printer/gcode/script', $body, 'application/json', $printerId);
	}

	/**
	 * @param array<string, mixed> $params
	 */
	private function buildGcodeScriptForAction(string $action, array $params): ?string
	{
		switch ($action) {
			case 'tune_speed':
				if (!isset($params['value']) || !is_numeric($params['value'])) {
					return null;
				}
				return sprintf('M220 S%d', $this->clampTuneFactor((float) $params['value']));
			case 'tune_flow':
				if (!isset($params['value']) || !is_numeric($params['value'])) {
					return null;
				}
				return sprintf('M221 S%d', $this->clampTuneFactor((float) $params['value']));
			case 'tune_fan':
				if (!isset($params['value']) || !is_numeric($params['value'])) {
					return null;
				}
				return sprintf('M106 S%d', $this->clampFanSpeed((float) $params['value']));
			case 'babystep_z':
				if (!isset($params['value']) || !is_numeric($params['value'])) {
					return null;
				}
				$adjust = $this->clampBabystepZ((float) $params['value']);
				return sprintf('SET_GCODE_OFFSET Z_ADJUST=%.3f MOVE=1', $adjust);
			case 'home_all':
				return 'G28';
			case 'home_z':
				return 'G28 Z';
			case 'disable_steppers':
				return 'M84';
			case 'bed_mesh_calibrate':
				return 'BED_MESH_CALIBRATE';
			case 'filament_load':
				return 'LOAD_FILAMENT';
			case 'filament_unload':
				return 'UNLOAD_FILAMENT';
			case 'filament_purge':
				return 'PURGE_FILAMENT';
			case 'set_heater_temp':
				return $this->buildSetHeaterTempScript($params);
			case 'exclude_object':
				return $this->buildExcludeObjectScript($params);
			case 'pid_calibrate':
				return $this->buildPidCalibrateScript($params);
			case 'jog':
				$axis = strtolower(trim((string) ($params['axis'] ?? '')));
				if (!in_array($axis, ['x', 'y', 'z'], true)) {
					return null;
				}
				if (!isset($params['distance']) || !is_numeric($params['distance'])) {
					return null;
				}
				$distance = $this->clampJogDistance((float) $params['distance']);
				if (abs($distance) < 0.0001) {
					return null;
				}
				$axisLetter = strtoupper($axis);
				return sprintf("G91\nG0 %s%.3f F3000\nG90", $axisLetter, $distance);
			default:
				return null;
		}
	}

	/**
	 * WS10/WS14: SET_HEATER_TEMPERATURE with a whitelisted heater name and a
	 * clamped target. Rejects arbitrary heater identifiers.
	 * @param array<string, mixed> $params
	 */
	private function buildSetHeaterTempScript(array $params): ?string
	{
		$heater = strtolower(trim((string) ($params['heater'] ?? '')));
		// Allow extruder, extruder1..N, heater_bed, and generic heater names.
		if (!preg_match('/^(heater_bed|extruder[0-9]?|heater_generic [a-z0-9_]+|[a-z0-9_]+)$/', $heater)) {
			return null;
		}
		if (!isset($params['target']) || !is_numeric($params['target'])) {
			return null;
		}
		$isBed = ($heater === 'heater_bed');
		$target = $isBed
			? $this->clampBedTemp((float) $params['target'])
			: $this->clampNozzleTemp((float) $params['target']);
		return sprintf('SET_HEATER_TEMPERATURE HEATER=%s TARGET=%d', $heater, (int) round($target));
	}

	/**
	 * WS13: EXCLUDE_OBJECT NAME=<name>. The object name originates from the
	 * printer's own exclude_object list; still constrained to a safe charset.
	 * @param array<string, mixed> $params
	 */
	private function buildExcludeObjectScript(array $params): ?string
	{
		$name = trim((string) ($params['name'] ?? ''));
		if ($name === '' || strlen($name) > 128) {
			return null;
		}
		// Klipper object names: alnum, space, underscore, dash, dot, parens.
		if (!preg_match('/^[A-Za-z0-9 _\-.()]+$/', $name)) {
			return null;
		}
		return sprintf('EXCLUDE_OBJECT NAME=%s', $name);
	}

	/**
	 * WS10: PID_CALIBRATE HEATER=<heater> TARGET=<temp>. Whitelisted heater.
	 * @param array<string, mixed> $params
	 */
	private function buildPidCalibrateScript(array $params): ?string
	{
		$heater = strtolower(trim((string) ($params['heater'] ?? '')));
		if (!in_array($heater, ['extruder', 'heater_bed'], true)) {
			return null;
		}
		if (!isset($params['target']) || !is_numeric($params['target'])) {
			return null;
		}
		$target = ($heater === 'heater_bed')
			? $this->clampBedTemp((float) $params['target'])
			: $this->clampNozzleTemp((float) $params['target']);
		if ($target <= 0) {
			return null;
		}
		return sprintf('PID_CALIBRATE HEATER=%s TARGET=%d', $heater, (int) round($target));
	}

	/**
	 * WS11: arbitrary G-code console send. Only reachable when the admin has
	 * turned on `console_enabled`. Per-command guard: length cap, single line,
	 * printable ASCII. Motion-while-printing rules still apply.
	 */
	#[NoCSRFRequired]
	#[NoAdminRequired]
	public function consoleCommand(): JSONResponse
	{
		if ($gate = $this->controlGate()) {
			return $gate;
		}
		if (!$this->config->isConsoleEnabled()) {
			return new JSONResponse(
				['error' => 'console_disabled', 'message' => 'The G-code console is disabled by the administrator.'],
				Http::STATUS_FORBIDDEN,
			);
		}

		$params = $this->mergedParams();
		$printerId = $this->printerIdFromParams($params);
		$command = (string) ($params['command'] ?? '');

		if ($command === '' || strlen($command) > self::CONSOLE_CMD_MAX_LEN) {
			return new JSONResponse(
				['error' => 'invalid_command', 'message' => 'Command must be 1-256 characters'],
				Http::STATUS_BAD_REQUEST,
			);
		}
		// Single line, printable ASCII only (no control chars, no newlines).
		if (preg_match('/[^\x20-\x7E]/', $command)) {
			return new JSONResponse(
				['error' => 'invalid_command', 'message' => 'Command must be a single line of printable ASCII'],
				Http::STATUS_BAD_REQUEST,
			);
		}

		$result = $this->sendGcodeScript(trim($command), $printerId);
		if ($result === null) {
			return new JSONResponse(
				['error' => 'backend_unreachable', 'message' => 'Moonraker console request failed'],
				Http::STATUS_BAD_GATEWAY,
			);
		}

		return new JSONResponse($result);
	}

	/** @return array<string, mixed>|null */
	private function moonrakerPost(string $path, string $body, string $contentType, ?string $printerId = null): ?array
	{
		$url = rtrim($this->config->resolveMoonrakerUrl($printerId), '/') . '/' . ltrim($path, '/');

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

	/**
	 * Read-only GET against Moonraker (for endpoints that only accept GET, e.g.
	 * machine/system_info). Same resolve/timeout/logging discipline as the POST
	 * helper; returns the decoded array or null on failure.
	 *
	 * @return array<string, mixed>|null
	 */
	private function moonrakerGet(string $path, ?string $printerId = null): ?array
	{
		$url = rtrim($this->config->resolveMoonrakerUrl($printerId), '/') . '/' . ltrim($path, '/');

		$ch = curl_init();
		curl_setopt($ch, CURLOPT_URL, $url);
		curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
		curl_setopt($ch, CURLOPT_TIMEOUT, self::DEFAULT_TIMEOUT_SECONDS);
		curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, self::CONNECT_TIMEOUT_SECONDS);

		$responseBody = curl_exec($ch);
		$httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
		$error = curl_error($ch);
		curl_close($ch);

		if ($responseBody === false || $error !== '' || $httpCode < 200 || $httpCode >= 300) {
			$this->logger->warning('PrinterController Moonraker GET failed', [
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
