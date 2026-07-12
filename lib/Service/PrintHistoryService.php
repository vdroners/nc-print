<?php

declare(strict_types=1);

namespace OCA\NcPrint\Service;

use OCA\NcPrint\Db\PrintRecord;
use OCA\NcPrint\Db\PrintRecordMapper;
use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Utility\ITimeFactory;
use Psr\Log\LoggerInterface;

/**
 * Durable print history + derived quality metrics and consumable-wear hints.
 *
 * Rows are captured from PrintEventController on the terminal print transition
 * (complete/error/cancel). Every read/write is best-effort: a DB failure is
 * logged and swallowed so it can never surface as a UI error, matching the
 * notification/activity contract already used by PrintEventController.
 *
 * Wear figures are HEURISTIC estimates, not hardware guarantees. The nozzle-wear
 * proxy assumes brass-nozzle abrasion scales with grams of abrasive filament
 * (CF/GF/wood/glow); the threshold below is a rough default and is labelled as
 * an estimate wherever it is surfaced.
 */
class PrintHistoryService
{
	/** Result values we persist. */
	public const RESULTS = ['complete', 'error', 'cancel'];

	/**
	 * Materials whose particles abrade brass nozzles. Matched case-insensitively
	 * against a normalized material token (see normalizeMaterial()).
	 *
	 * @var list<string>
	 */
	private const ABRASIVE = ['pa-cf', 'pla-cf', 'petg-cf', 'abs-cf', 'pc-cf', 'nylon-cf',
		'pa-gf', 'pla-gf', 'petg-gf', 'cf', 'gf', 'wood', 'glow', 'glitter', 'metal-fill'];

	/**
	 * Grams of abrasive filament a stock brass nozzle is assumed to tolerate
	 * before wear is worth inspecting. Deliberately conservative; a rough
	 * community heuristic, not a spec. Surfaced as an estimate only.
	 */
	private const NOZZLE_ABRASIVE_THRESHOLD_G = 250.0;

	/** Print-hours after which a PTFE-lined hotend is worth inspecting. */
	private const PTFE_INSPECT_HOURS = 500.0;

	/** ETA ratios outside this band are tracking noise (paused/aborted). */
	private const RATIO_MIN = 0.3;
	private const RATIO_MAX = 3.0;

	public function __construct(
		private PrintRecordMapper $mapper,
		private ITimeFactory $time,
		private LoggerInterface $logger,
	) {
	}

	/**
	 * Persist one terminated print. Returns the stored record, or null if the
	 * payload was invalid or the insert failed (never throws to the caller).
	 *
	 * @param array<string,mixed> $ctx
	 */
	public function record(string $uid, array $ctx): ?PrintRecord
	{
		$uid = trim($uid);
		if ($uid === '') {
			return null;
		}
		$result = strtolower(trim((string) ($ctx['result'] ?? '')));
		if (!in_array($result, self::RESULTS, true)) {
			return null;
		}
		try {
			$now = $this->time->getTime();
			$rec = new PrintRecord();
			$rec->setUid($uid);
			$rec->setPrinterId(self::clampStr($ctx['printer_id'] ?? '', 128));
			$rec->setPrinterName(self::clampStrOrNull($ctx['printer_name'] ?? null, 255));
			$rec->setFilename(self::clampStr($ctx['filename'] ?? 'Print job', 512) ?: 'Print job');
			$rec->setMaterial(self::normalizeMaterial($ctx['material'] ?? null));
			$rec->setNozzleDiameter(self::posFloatOrNull($ctx['nozzle_diameter'] ?? null));
			$rec->setResult($result);
			$rec->setFailureReason(self::clampStrOrNull($ctx['failure_reason'] ?? null, 255));
			$rec->setStartedAt(self::posIntOrNull($ctx['started_at'] ?? null));
			$rec->setEndedAt(self::posIntOrNull($ctx['ended_at'] ?? null) ?? $now);
			$rec->setDurationS((int) max(0, self::posIntOrNull($ctx['duration_s'] ?? null) ?? 0));
			$rec->setSlicerDurationS(self::posIntOrNull($ctx['slicer_duration_s'] ?? null));
			$rec->setFilamentG(self::posFloatOrNull($ctx['filament_g'] ?? null));
			$rec->setFilamentMm(self::posFloatOrNull($ctx['filament_mm'] ?? null));
			$rec->setLayerHeight(self::posFloatOrNull($ctx['layer_height'] ?? null));
			$rec->setCreatedAt($now);
			return $this->mapper->insert($rec);
		} catch (\Throwable $e) {
			$this->logger->warning('nc_print history record failed', ['exception' => $e]);
			return null;
		}
	}

	/**
	 * @param array<string,mixed> $filters
	 * @return array{items:array,total:int,limit:int,offset:int}
	 */
	public function list(string $uid, array $filters, int $limit, int $offset): array
	{
		$limit = max(1, min(500, $limit));
		$offset = max(0, $offset);
		try {
			$rows = $this->mapper->findByUser($uid, $limit, $offset, $filters);
			$total = $this->mapper->countByUser($uid, $filters);
		} catch (\Throwable $e) {
			$this->logger->warning('nc_print history list failed', ['exception' => $e]);
			$rows = [];
			$total = 0;
		}
		return [
			'items' => array_map(static fn (PrintRecord $r) => $r->jsonSerialize(), $rows),
			'total' => $total,
			'limit' => $limit,
			'offset' => $offset,
		];
	}

	/**
	 * Quality metrics: overall + per-printer/per-material aggregates.
	 *
	 * @return array<string,mixed>
	 */
	public function metrics(string $uid): array
	{
		try {
			$agg = $this->mapper->aggregateByPrinterMaterial($uid);
			$resultCounts = $this->mapper->resultCountsByPrinter($uid);
			$pairs = $this->mapper->durationPairs($uid);
		} catch (\Throwable $e) {
			$this->logger->warning('nc_print history metrics failed', ['exception' => $e]);
			return ['overall' => self::emptyOverall(), 'by_printer' => []];
		}

		// Per-printer result tallies.
		$byPrinter = [];
		foreach ($resultCounts as $row) {
			$pid = (string) $row['printer_id'];
			$byPrinter[$pid] ??= ['printer_id' => $pid, 'total' => 0, 'complete' => 0,
				'error' => 0, 'cancel' => 0, 'filament_g' => 0.0, 'print_hours' => 0.0,
				'materials' => []];
			$res = (string) $row['result'];
			$cnt = (int) $row['cnt'];
			$byPrinter[$pid]['total'] += $cnt;
			if (isset($byPrinter[$pid][$res])) {
				$byPrinter[$pid][$res] += $cnt;
			}
		}
		// Fold in filament + duration + material breakdown.
		foreach ($agg as $row) {
			$pid = (string) $row['printer_id'];
			$byPrinter[$pid] ??= ['printer_id' => $pid, 'total' => 0, 'complete' => 0,
				'error' => 0, 'cancel' => 0, 'filament_g' => 0.0, 'print_hours' => 0.0,
				'materials' => []];
			$byPrinter[$pid]['filament_g'] += (float) ($row['sum_filament'] ?? 0);
			$byPrinter[$pid]['print_hours'] += (float) ($row['sum_duration'] ?? 0) / 3600.0;
			$mat = (string) ($row['material'] ?? '') ?: 'unknown';
			$byPrinter[$pid]['materials'][$mat] = ($byPrinter[$pid]['materials'][$mat] ?? 0) + (int) ($row['total'] ?? 0);
		}

		// Per-printer ETA accuracy + median duration from the pulled pairs.
		$durByPrinter = [];
		$ratioByPrinter = [];
		$allDur = [];
		$allRatio = [];
		foreach ($pairs as $p) {
			$pid = (string) $p['printer_id'];
			$d = (int) $p['duration_s'];
			if ($d > 0) {
				$durByPrinter[$pid][] = $d;
				$allDur[] = $d;
			}
			$s = $p['slicer_duration_s'] !== null ? (int) $p['slicer_duration_s'] : 0;
			if ($d > 0 && $s > 0) {
				$ratio = $d / $s;
				if ($ratio >= self::RATIO_MIN && $ratio <= self::RATIO_MAX) {
					$ratioByPrinter[$pid][] = $ratio;
					$allRatio[] = $ratio;
				}
			}
		}
		foreach ($byPrinter as $pid => &$pinfo) {
			$pinfo['success_rate'] = $pinfo['total'] > 0
				? round($pinfo['complete'] / $pinfo['total'], 3) : null;
			$pinfo['median_duration_s'] = self::median($durByPrinter[$pid] ?? []);
			[$mean, $std] = self::meanStd($ratioByPrinter[$pid] ?? []);
			$pinfo['eta_ratio_mean'] = $mean;
			$pinfo['eta_ratio_stdev'] = $std;
			$pinfo['filament_g'] = round($pinfo['filament_g'], 1);
			$pinfo['print_hours'] = round($pinfo['print_hours'], 2);
		}
		unset($pinfo);

		// Overall roll-up.
		$overall = self::emptyOverall();
		foreach ($byPrinter as $p) {
			$overall['total'] += $p['total'];
			$overall['complete'] += $p['complete'];
			$overall['error'] += $p['error'];
			$overall['cancel'] += $p['cancel'];
			$overall['filament_g'] += $p['filament_g'];
			$overall['print_hours'] += $p['print_hours'];
		}
		$overall['success_rate'] = $overall['total'] > 0
			? round($overall['complete'] / $overall['total'], 3) : null;
		$overall['median_duration_s'] = self::median($allDur);
		[$oMean, $oStd] = self::meanStd($allRatio);
		$overall['eta_ratio_mean'] = $oMean;
		$overall['eta_ratio_stdev'] = $oStd;
		$overall['filament_g'] = round($overall['filament_g'], 1);
		$overall['print_hours'] = round($overall['print_hours'], 2);

		return ['overall' => $overall, 'by_printer' => array_values($byPrinter)];
	}

	/**
	 * Aggregated analytics for the Overview dashboard: reuses metrics() for the
	 * totals / per-printer / per-material rollups and adds a weekly time series
	 * (prints + filament grams) plus a rough filament-cost estimate.
	 *
	 * Cost is an estimate: grams × (default price per kg). We don't yet match a
	 * print to a specific spool, so a single configurable default is used.
	 *
	 * @return array{overall:array,by_printer:array,by_material:array,weekly:list<array>,cost:array}
	 */
	public function analytics(string $uid, float $pricePerKg = 25.0): array
	{
		$metrics = $this->metrics($uid);

		// Per-material rollup across all printers.
		$byMaterial = [];
		foreach ($metrics['by_printer'] as $p) {
			foreach (($p['materials'] ?? []) as $mat => $cnt) {
				$byMaterial[$mat] = ($byMaterial[$mat] ?? 0) + (int) $cnt;
			}
		}
		arsort($byMaterial);
		$materialList = [];
		foreach ($byMaterial as $mat => $cnt) {
			$materialList[] = ['material' => $mat, 'count' => $cnt];
		}

		// Weekly time series, bucketed in PHP (portable). Week key = the Monday
		// (unix seconds) of the ISO week the print ended in.
		$weekly = [];
		try {
			$rows = $this->mapper->analyticsRows($uid);
			foreach ($rows as $r) {
				$ended = (int) ($r['ended_at'] ?? 0);
				if ($ended <= 0) {
					continue;
				}
				$dow = (int) gmdate('N', $ended); // 1=Mon..7=Sun
				$weekStart = $ended - (($dow - 1) * 86400);
				$weekStart -= $weekStart % 86400; // floor to midnight UTC
				$key = (string) $weekStart;
				$weekly[$key] ??= ['week_start' => $weekStart, 'prints' => 0, 'complete' => 0,
					'filament_g' => 0.0, 'print_hours' => 0.0];
				$weekly[$key]['prints']++;
				if ((string) ($r['result'] ?? '') === 'complete') {
					$weekly[$key]['complete']++;
				}
				$weekly[$key]['filament_g'] += (float) ($r['filament_g'] ?? 0);
				$weekly[$key]['print_hours'] += (float) ($r['duration_s'] ?? 0) / 3600.0;
			}
		} catch (\Throwable $e) {
			$this->logger->warning('nc_print analytics weekly failed', ['exception' => $e]);
		}
		// Chronological, rounded, last 26 weeks.
		ksort($weekly);
		$weeklyList = array_map(static function ($w) {
			$w['filament_g'] = round($w['filament_g'], 1);
			$w['print_hours'] = round($w['print_hours'], 2);
			return $w;
		}, array_values($weekly));
		if (count($weeklyList) > 26) {
			$weeklyList = array_slice($weeklyList, -26);
		}

		$filamentG = (float) ($metrics['overall']['filament_g'] ?? 0);
		$cost = [
			'price_per_kg' => $pricePerKg,
			'filament_g' => round($filamentG, 1),
			'estimated_total' => round(($filamentG / 1000.0) * $pricePerKg, 2),
		];

		return [
			'overall' => $metrics['overall'],
			'by_printer' => $metrics['by_printer'],
			'by_material' => $materialList,
			'weekly' => $weeklyList,
			'cost' => $cost,
		];
	}

	/**
	 * Consumable-wear estimates per printer. All figures are heuristic; callers
	 * must present them as estimates.
	 *
	 * @return array{printers:array,threshold_g:float,ptfe_inspect_hours:float,disclaimer:string}
	 */
	public function wear(string $uid): array
	{
		try {
			$rows = $this->mapper->wearTotals($uid, self::ABRASIVE);
		} catch (\Throwable $e) {
			$this->logger->warning('nc_print history wear failed', ['exception' => $e]);
			$rows = [];
		}
		$printers = [];
		foreach ($rows as $row) {
			$pid = (string) $row['printer_id'];
			$hours = round((float) ($row['sum_duration'] ?? 0) / 3600.0, 2);
			$abrasiveG = (float) ($row['sum_abrasive'] ?? 0);
			$wearPct = min(100.0, round($abrasiveG / self::NOZZLE_ABRASIVE_THRESHOLD_G * 100.0, 1));
			$hints = [];
			if ($wearPct >= 80.0) {
				$hints[] = 'Nozzle wear estimate is high — consider inspecting/replacing the nozzle (abrasive filament).';
			}
			if ($hours >= self::PTFE_INSPECT_HOURS) {
				$hints[] = 'Over ' . (int) self::PTFE_INSPECT_HOURS . ' print-hours — if this is a PTFE-lined hotend, inspect the liner.';
			}
			$printers[] = [
				'printer_id' => $pid,
				'total_prints' => (int) ($row['total'] ?? 0),
				'print_hours' => $hours,
				'filament_g' => round((float) ($row['sum_filament'] ?? 0), 1),
				'abrasive_filament_g' => round($abrasiveG, 1),
				'nozzle_wear_pct' => $wearPct,
				'service_hints' => $hints,
			];
		}
		return [
			'printers' => $printers,
			'threshold_g' => self::NOZZLE_ABRASIVE_THRESHOLD_G,
			'ptfe_inspect_hours' => self::PTFE_INSPECT_HOURS,
			'disclaimer' => 'Wear figures are rough estimates from print history, not hardware measurements.',
		];
	}

	public function delete(string $uid, int $id): bool
	{
		try {
			return $this->mapper->deleteForUser($id, $uid) > 0;
		} catch (\Throwable $e) {
			$this->logger->warning('nc_print history delete failed', ['exception' => $e]);
			return false;
		}
	}

	public function clear(string $uid): int
	{
		try {
			return $this->mapper->deleteAllForUser($uid);
		} catch (\Throwable $e) {
			$this->logger->warning('nc_print history clear failed', ['exception' => $e]);
			return 0;
		}
	}

	// ── helpers ──────────────────────────────────────────────────────────────

	/** @return array<string,mixed> */
	private static function emptyOverall(): array
	{
		return ['total' => 0, 'complete' => 0, 'error' => 0, 'cancel' => 0,
			'filament_g' => 0.0, 'print_hours' => 0.0, 'success_rate' => null,
			'median_duration_s' => null, 'eta_ratio_mean' => null, 'eta_ratio_stdev' => null];
	}

	/** @param list<int> $values */
	private static function median(array $values): ?int
	{
		$n = count($values);
		if ($n === 0) {
			return null;
		}
		sort($values);
		$mid = intdiv($n, 2);
		if ($n % 2 === 1) {
			return $values[$mid];
		}
		return (int) round(($values[$mid - 1] + $values[$mid]) / 2);
	}

	/**
	 * @param list<float> $values
	 * @return array{0:?float,1:?float} [mean, population stdev]
	 */
	private static function meanStd(array $values): array
	{
		$n = count($values);
		if ($n === 0) {
			return [null, null];
		}
		$mean = array_sum($values) / $n;
		$var = 0.0;
		foreach ($values as $v) {
			$var += ($v - $mean) ** 2;
		}
		$var /= $n;
		return [round($mean, 3), round(sqrt($var), 3)];
	}

	private static function clampStr(mixed $v, int $max): string
	{
		$s = trim((string) $v);
		return $s === '' ? '' : mb_substr($s, 0, $max);
	}

	private static function clampStrOrNull(mixed $v, int $max): ?string
	{
		$s = trim((string) ($v ?? ''));
		return $s === '' ? null : mb_substr($s, 0, $max);
	}

	/** Normalize a material label to a lower-case token (e.g. "PA-CF" -> "pa-cf"). */
	private static function normalizeMaterial(mixed $v): ?string
	{
		$s = strtolower(trim((string) ($v ?? '')));
		if ($s === '') {
			return null;
		}
		$s = preg_replace('/\s+/', '-', $s) ?? $s;
		return mb_substr($s, 0, 64);
	}

	private static function posIntOrNull(mixed $v): ?int
	{
		if ($v === null || $v === '' || !is_numeric($v)) {
			return null;
		}
		$n = (int) round((float) $v);
		return $n >= 0 ? $n : null;
	}

	private static function posFloatOrNull(mixed $v): ?float
	{
		if ($v === null || $v === '' || !is_numeric($v)) {
			return null;
		}
		$n = (float) $v;
		return ($n >= 0 && is_finite($n)) ? $n : null;
	}
}
