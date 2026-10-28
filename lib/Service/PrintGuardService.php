<?php

declare(strict_types=1);

namespace OCA\NcPrint\Service;

/**
 * Print Guard lite — Moonraker stall / temp deviation / filament sensor checks.
 * Forge port Wave 6. Notify-only by default (no auto pause/cancel).
 */
class PrintGuardService
{
	public const DEFAULT_TEMP_DEVIATION_C = 25.0;
	public const DEFAULT_STALL_MINUTES = 10.0;

	/**
	 * @param array<string, mixed> $moonrakerStatus  result.status from objects/query
	 * @param array<string, mixed>|null $prevSnapshot prior guard snapshot (progress tracking)
	 * @return array{alerts: list<array<string, mixed>>, snapshot: array<string, mixed>}
	 */
	public function evaluate(array $moonrakerStatus, ?array $prevSnapshot = null, array $settings = []): array
	{
		$tempDev = (float) ($settings['temp_deviation_c'] ?? self::DEFAULT_TEMP_DEVIATION_C);
		$stallMin = (float) ($settings['stall_minutes'] ?? self::DEFAULT_STALL_MINUTES);
		$now = time();
		$ps = $moonrakerStatus['print_stats'] ?? [];
		$ex = $moonrakerStatus['extruder'] ?? [];
		$bed = $moonrakerStatus['heater_bed'] ?? [];
		$ds = $moonrakerStatus['display_status'] ?? [];
		$virtual = $moonrakerStatus['virtual_sdcard'] ?? [];
		$fs = $moonrakerStatus['filament_switch_sensor'] ?? $moonrakerStatus['filament_sensor'] ?? null;

		$state = strtolower((string) ($ps['state'] ?? 'standby'));
		$printing = in_array($state, ['printing', 'paused'], true);
		// Same source order as PrinterController::normalizeProgress: file
		// progress (virtual_sdcard) wins over display_status / M73.
		$progress = self::progressPercent(
			is_array($virtual) ? ($virtual['progress'] ?? null) : null,
			is_array($ds) ? ($ds['progress'] ?? null) : null,
		);
		$filename = (string) ($ps['filename'] ?? '');

		$snapshot = [
			'state' => $state,
			'progress' => $progress,
			'filename' => $filename,
			'checked_at' => $now,
			'last_progress' => $prevSnapshot['last_progress'] ?? $progress,
			'last_progress_at' => $prevSnapshot['last_progress_at'] ?? $now,
		];
		if ($progress !== null && $progress !== ($prevSnapshot['last_progress'] ?? null)) {
			$snapshot['last_progress'] = $progress;
			$snapshot['last_progress_at'] = $now;
		}

		$alerts = [];
		if (!$printing) {
			return ['alerts' => $alerts, 'snapshot' => $snapshot];
		}

		// Temp deviation (skip low targets / ramp)
		$nt = isset($ex['temperature']) ? (float) $ex['temperature'] : null;
		$nTarget = isset($ex['target']) ? (float) $ex['target'] : null;
		if ($nt !== null && $nTarget !== null && $nTarget >= 150 && $nt >= 160) {
			$diff = abs($nt - $nTarget);
			if ($diff > $tempDev) {
				$alerts[] = [
					'type' => 'temp_deviation',
					'severity' => 'medium',
					'message' => sprintf('Nozzle %.1f°C vs target %.1f°C (Δ%.1f)', $nt, $nTarget, $diff),
				];
			}
		}
		$bt = isset($bed['temperature']) ? (float) $bed['temperature'] : null;
		$bTarget = isset($bed['target']) ? (float) $bed['target'] : null;
		if ($bt !== null && $bTarget !== null && $bTarget > 0) {
			$diff = abs($bt - $bTarget);
			if ($diff > $tempDev) {
				$alerts[] = [
					'type' => 'temp_deviation',
					'severity' => 'medium',
					'message' => sprintf('Bed %.1f°C vs target %.1f°C (Δ%.1f)', $bt, $bTarget, $diff),
				];
			}
		}

		// Stall: no progress for stall_minutes while printing
		if ($state === 'printing' && $snapshot['last_progress_at']) {
			$elapsed = $now - (int) $snapshot['last_progress_at'];
			if ($elapsed > (int) ($stallMin * 60)) {
				$alerts[] = [
					'type' => 'print_stall',
					'severity' => 'medium',
					'message' => sprintf('No progress for %d min (%s)', (int) ($elapsed / 60), $filename ?: 'unknown'),
				];
			}
		}

		// Filament runout if sensor present and reports empty
		if (is_array($fs)) {
			$detected = $fs['filament_detected'] ?? $fs['enabled'] ?? null;
			if ($detected === false || $detected === 0 || $detected === '0') {
				$alerts[] = [
					'type' => 'filament_runout',
					'severity' => 'high',
					'message' => 'Filament sensor reports no filament',
				];
			}
		}

		return ['alerts' => $alerts, 'snapshot' => $snapshot];
	}

	/**
	 * Percent 0–100, or null when neither source has a positive reading.
	 * Values already above 1 are treated as percent (M73-style).
	 */
	public static function progressPercent(mixed $primary, mixed $fallback): ?float
	{
		foreach ([$primary, $fallback] as $value) {
			if (!is_numeric($value)) {
				continue;
			}
			$progress = (float) $value;
			if ($progress <= 0.0) {
				continue;
			}
			if ($progress <= 1.0) {
				$progress *= 100.0;
			}
			return $progress;
		}
		return null;
	}
}
