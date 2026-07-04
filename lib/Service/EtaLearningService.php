<?php

declare(strict_types=1);

namespace OCA\NcPrint\Service;

use OCA\NcPrint\AppInfo\Application;
use OCP\IConfig;

/**
 * Smart ETA learning — learns each printer's slicer-vs-actual delta over time
 * and applies it to new prints for sharper time estimates.
 *
 * Ported (algorithm) from 3dprintforge's eta-predictor.js, but storage is a
 * single app-config JSON blob (Nextcloud IConfig) rather than SQLite — the data
 * is small (a handful of buckets per printer) and this keeps the app
 * self-contained with no schema/migration.
 *
 * Bucketing: (printerId, material, nozzleDiameter). Each bucket keeps an
 * exponentially-weighted moving multiplier (actual / slicer) so recent prints
 * carry more weight but a single outlier can't swing it.
 *
 * predict() is pure — pass the slicer estimate + bucket params, get the adjusted
 * estimate plus a confidence figure. Bookkeeping happens in recordCompletion(),
 * typically called from the print monitor when a print finishes.
 */
class EtaLearningService
{
	public const KEY_ETA_BUCKETS = 'eta_buckets';

	/** Newer prints contribute 25% to the moving multiplier. */
	private const EWMA_ALPHA = 0.25;
	private const DEFAULT_MULTIPLIER = 1.0;
	/** Ratios outside this band are almost certainly a tracking bug or a
	 * paused print, not a real signal — skip the update. */
	private const RATIO_MIN = 0.3;
	private const RATIO_MAX = 3.0;
	/** Confidence saturates at this many samples. */
	private const CONFIDENCE_SATURATION = 10;

	public function __construct(
		private IConfig $config,
	) {
	}

	/**
	 * Predict actual print duration from the slicer estimate + learned history.
	 *
	 * @return array{predicted_minutes: float, slicer_minutes: float, multiplier: float, samples: int, confidence: float}
	 */
	public function predict(float $slicerMinutes, array $ctx): array
	{
		if (!is_finite($slicerMinutes) || $slicerMinutes <= 0) {
			return $this->predictionResult(0.0, 0.0, self::DEFAULT_MULTIPLIER, 0);
		}
		$printerId = trim((string) ($ctx['printerId'] ?? ''));
		if ($printerId === '') {
			// No printer context — echo the slicer estimate back unchanged.
			return $this->predictionResult($slicerMinutes, $slicerMinutes, self::DEFAULT_MULTIPLIER, 0);
		}

		$bucket = $this->getBucket($this->bucketKey($printerId, $ctx['material'] ?? null, $ctx['nozzleDiameter'] ?? null));
		$multiplier = $bucket['multiplier'] ?? self::DEFAULT_MULTIPLIER;
		$samples = (int) ($bucket['samples'] ?? 0);
		$predicted = round($slicerMinutes * $multiplier);
		return $this->predictionResult($predicted, $slicerMinutes, $multiplier, $samples);
	}

	/**
	 * Update the multiplier for a (printer, material, nozzle) bucket after a
	 * print finishes. Both estimates in minutes; ignored when either side is
	 * non-positive or the ratio is out of the sanity band.
	 *
	 * @return array|null the updated bucket, or null if the sample was rejected
	 */
	public function recordCompletion(array $ctx, float $slicerMinutes, float $actualMinutes): ?array
	{
		$printerId = trim((string) ($ctx['printerId'] ?? ''));
		if ($printerId === '') {
			return null;
		}
		if (!is_finite($slicerMinutes) || $slicerMinutes <= 0) {
			return null;
		}
		if (!is_finite($actualMinutes) || $actualMinutes <= 0) {
			return null;
		}
		$ratio = $actualMinutes / $slicerMinutes;
		if ($ratio < self::RATIO_MIN || $ratio > self::RATIO_MAX) {
			return null;
		}

		$material = $this->normalizeMaterial($ctx['material'] ?? null);
		$nozzle = $this->normalizeNozzle($ctx['nozzleDiameter'] ?? null);
		$key = $this->bucketKey($printerId, $material, $nozzle);

		$buckets = $this->loadBuckets();
		$existing = $buckets[$key] ?? null;
		if ($existing === null) {
			$buckets[$key] = [
				'printer_id' => $printerId,
				'material' => $material,
				'nozzle_diameter' => $nozzle,
				'multiplier' => $ratio,
				'samples' => 1,
				'total_slicer_min' => $slicerMinutes,
				'total_actual_min' => $actualMinutes,
				'last_slicer_min' => $slicerMinutes,
				'last_actual_min' => $actualMinutes,
			];
		} else {
			$newMult = (1 - self::EWMA_ALPHA) * (float) $existing['multiplier'] + self::EWMA_ALPHA * $ratio;
			$buckets[$key] = [
				'printer_id' => $printerId,
				'material' => $material,
				'nozzle_diameter' => $nozzle,
				'multiplier' => $newMult,
				'samples' => (int) $existing['samples'] + 1,
				'total_slicer_min' => (float) $existing['total_slicer_min'] + $slicerMinutes,
				'total_actual_min' => (float) $existing['total_actual_min'] + $actualMinutes,
				'last_slicer_min' => $slicerMinutes,
				'last_actual_min' => $actualMinutes,
			];
		}
		$this->saveBuckets($buckets);
		return $this->publicBucket($buckets[$key]);
	}

	/**
	 * All learned buckets for a printer (per-material accuracy panel).
	 * @return list<array>
	 */
	public function listForPrinter(string $printerId): array
	{
		$printerId = trim($printerId);
		$out = [];
		foreach ($this->loadBuckets() as $bucket) {
			if (($bucket['printer_id'] ?? '') === $printerId) {
				$out[] = $this->publicBucket($bucket);
			}
		}
		usort($out, static fn ($a, $b) => $b['samples'] <=> $a['samples']);
		return $out;
	}

	// --- internals -----------------------------------------------------------

	private function bucketKey(string $printerId, mixed $material, mixed $nozzle): string
	{
		return $printerId . '::' . $this->normalizeMaterial($material)
			. '::' . number_format($this->normalizeNozzle($nozzle), 2, '.', '');
	}

	private function normalizeMaterial(mixed $material): string
	{
		$m = strtolower(trim((string) ($material ?? '')));
		return $m === '' ? 'unknown' : $m;
	}

	private function normalizeNozzle(mixed $nozzle): float
	{
		$n = is_numeric($nozzle) ? (float) $nozzle : 0.4;
		return $n > 0 ? $n : 0.4;
	}

	private function getBucket(string $key): array
	{
		return $this->loadBuckets()[$key] ?? [];
	}

	/** @return array<string, array> */
	private function loadBuckets(): array
	{
		$raw = $this->config->getAppValue(Application::APP_ID, self::KEY_ETA_BUCKETS, '');
		if ($raw === '') {
			return [];
		}
		$decoded = json_decode($raw, true);
		return is_array($decoded) ? $decoded : [];
	}

	/** @param array<string, array> $buckets */
	private function saveBuckets(array $buckets): void
	{
		$this->config->setAppValue(
			Application::APP_ID,
			self::KEY_ETA_BUCKETS,
			json_encode($buckets, JSON_THROW_ON_ERROR),
		);
	}

	private function publicBucket(array $bucket): array
	{
		return [
			'printer_id' => (string) ($bucket['printer_id'] ?? ''),
			'material' => (string) ($bucket['material'] ?? 'unknown'),
			'nozzle_diameter' => (float) ($bucket['nozzle_diameter'] ?? 0.4),
			'multiplier' => round((float) ($bucket['multiplier'] ?? self::DEFAULT_MULTIPLIER), 4),
			'samples' => (int) ($bucket['samples'] ?? 0),
			'total_slicer_min' => round((float) ($bucket['total_slicer_min'] ?? 0), 1),
			'total_actual_min' => round((float) ($bucket['total_actual_min'] ?? 0), 1),
			'last_slicer_min' => round((float) ($bucket['last_slicer_min'] ?? 0), 1),
			'last_actual_min' => round((float) ($bucket['last_actual_min'] ?? 0), 1),
		];
	}

	private function predictionResult(float $predicted, float $slicer, float $multiplier, int $samples): array
	{
		$confidence = min(1.0, $samples / self::CONFIDENCE_SATURATION);
		return [
			'predicted_minutes' => $predicted,
			'slicer_minutes' => $slicer,
			'multiplier' => round($multiplier, 4),
			'samples' => $samples,
			'confidence' => round($confidence, 2),
		];
	}
}
