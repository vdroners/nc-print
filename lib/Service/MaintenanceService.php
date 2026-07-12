<?php

declare(strict_types=1);

namespace OCA\NcPrint\Service;

use OCA\NcPrint\Db\MaintenanceRecord;
use OCA\NcPrint\Db\MaintenanceRecordMapper;
use OCP\AppFramework\Utility\ITimeFactory;
use Psr\Log\LoggerInterface;

/**
 * Maintenance / wear pillar. Layers component-lifetime tracking on top of the
 * print-history wear heuristic: PrintHistoryService::wear() supplies per-printer
 * cumulative print-hours (and abrasive grams), and this service tracks when each
 * component was last serviced so it can estimate how much of its lifetime has
 * been used.
 *
 * Lifetimes are HEURISTIC print-hour budgets, not hardware guarantees — every
 * figure is surfaced as an estimate. Every read/write is best-effort: a DB
 * failure is logged and swallowed so it can never surface as a UI error, matching
 * the contract used by PrintHistoryService / FilamentInventoryService.
 */
class MaintenanceService
{
	/**
	 * Default component lifetimes in print-hours. Deliberately conservative
	 * community heuristics, not specs; surfaced as estimates only.
	 *
	 * @var array<string,float>
	 */
	private const LIFETIMES = [
		'brass_nozzle' => 400.0,
		'hardened_nozzle' => 800.0,
		'ptfe_tube' => 500.0,
		'belts' => 3000.0,
		'build_plate' => 1000.0,
		'lubrication' => 300.0,
	];

	/** Human-readable labels for the known components. */
	private const LABELS = [
		'brass_nozzle' => 'Brass nozzle',
		'hardened_nozzle' => 'Hardened nozzle',
		'ptfe_tube' => 'PTFE tube',
		'belts' => 'Belts',
		'build_plate' => 'Build plate',
		'lubrication' => 'Lubrication',
	];

	/** Actions we persist. */
	public const ACTIONS = ['replaced', 'cleaned', 'inspected', 'lubricated'];

	/** Column lengths (mirrors the migration) used for clamping. */
	private const LEN_PRINTER_ID = 128;
	private const LEN_COMPONENT = 64;
	private const LEN_NOTES = 512;

	public function __construct(
		private MaintenanceRecordMapper $mapper,
		private PrintHistoryService $history,
		private ITimeFactory $time,
		private LoggerInterface $logger,
	) {
	}

	/**
	 * Per-printer, per-component wear/lifetime estimates. Reuses the print-history
	 * wear() output for cumulative print-hours and layers the maintenance log on
	 * top to compute hours-since-service, percent-used and remaining hours.
	 *
	 * @return array{printers:array,components:array<string,float>,disclaimer:string}
	 */
	public function summary(string $uid): array
	{
		$wear = [];
		try {
			$wear = $this->history->wear($uid);
		} catch (\Throwable $e) {
			$this->logger->warning('nc_print maintenance wear input failed', ['exception' => $e]);
			$wear = [];
		}
		$wearPrinters = is_array($wear['printers'] ?? null) ? $wear['printers'] : [];

		$latest = [];
		try {
			$latest = $this->mapper->latestByComponent($uid);
		} catch (\Throwable $e) {
			$this->logger->warning('nc_print maintenance summary lookup failed', ['exception' => $e]);
			$latest = [];
		}

		$printers = [];
		foreach ($wearPrinters as $p) {
			$pid = (string) ($p['printer_id'] ?? '');
			$printHours = (float) ($p['print_hours'] ?? 0);

			$components = [];
			foreach (self::LIFETIMES as $component => $lifetime) {
				$key = $pid . "\0" . $component;
				/** @var MaintenanceRecord|null $last */
				$last = $latest[$key] ?? null;

				// hours_at of the most-recent action; 0 if never serviced (treat
				// as the full current print-hours having accrued since new).
				$servicedAt = 0.0;
				$lastActionAt = null;
				if ($last !== null) {
					$servicedAt = $last->getHoursAt() !== null ? (float) $last->getHoursAt() : 0.0;
					$lastActionAt = (int) $last->getAt();
				}

				$hoursSinceService = max(0.0, $printHours - $servicedAt);
				$percentUsed = $lifetime > 0
					? max(0.0, min(999.0, round($hoursSinceService / $lifetime * 100.0, 1)))
					: 0.0;
				$hoursRemaining = max(0.0, round($lifetime - $hoursSinceService, 1));

				$components[] = [
					'component' => $component,
					'label' => self::LABELS[$component] ?? $component,
					'lifetime_hours' => $lifetime,
					'hours_since_service' => round($hoursSinceService, 2),
					'percent_used' => $percentUsed,
					'hours_remaining' => $hoursRemaining,
					'status' => self::statusFor($percentUsed),
					'last_action_at' => $lastActionAt,
				];
			}

			$printers[] = [
				'printer_id' => $pid,
				'print_hours' => $printHours,
				'components' => $components,
			];
		}

		return [
			'printers' => $printers,
			'components' => self::LIFETIMES,
			'disclaimer' => 'Heuristic estimates based on tracked print-hours — not hardware guarantees.',
		];
	}

	/**
	 * Log a maintenance action. Returns the stored row, or null if the payload
	 * was invalid or the insert failed (never throws to the caller).
	 *
	 * @param array<string,mixed> $data
	 */
	public function log(string $uid, array $data): ?array
	{
		$uid = trim($uid);
		if ($uid === '') {
			return null;
		}
		$printerId = self::clampStr($data['printer_id'] ?? '', self::LEN_PRINTER_ID);
		$component = self::normComponent($data['component'] ?? '');
		if ($printerId === '' || $component === '') {
			return null;
		}
		$action = self::normAction($data['action'] ?? '');

		try {
			$now = $this->time->getTime();

			// hours_at: explicit reading if provided, else snapshot the printer's
			// current print-hours from the wear() heuristic.
			$hoursAt = self::posFloatOrNull($data['hours_at'] ?? null);
			if ($hoursAt === null) {
				$hoursAt = $this->currentPrintHours($uid, $printerId);
			}

			$rec = new MaintenanceRecord();
			$rec->setUid($uid);
			$rec->setPrinterId($printerId);
			$rec->setComponent($component);
			$rec->setAction($action);
			$rec->setHoursAt($hoursAt);
			$rec->setCost(self::posFloatOrNull($data['cost'] ?? null));
			$rec->setNotes(self::clampStrOrNull($data['notes'] ?? null, self::LEN_NOTES));
			$rec->setAt($now);

			return $this->mapper->insert($rec)->jsonSerialize();
		} catch (\Throwable $e) {
			$this->logger->warning('nc_print maintenance log failed', ['exception' => $e]);
			return null;
		}
	}

	/** Current print-hours for a printer from the wear() heuristic, or null. */
	private function currentPrintHours(string $uid, string $printerId): ?float
	{
		try {
			$wear = $this->history->wear($uid);
		} catch (\Throwable $e) {
			$this->logger->warning('nc_print maintenance hours snapshot failed', ['exception' => $e]);
			return null;
		}
		foreach (($wear['printers'] ?? []) as $p) {
			if ((string) ($p['printer_id'] ?? '') === $printerId) {
				return (float) ($p['print_hours'] ?? 0);
			}
		}
		return null;
	}

	/** Map percent-used to a status band. */
	private static function statusFor(float $percentUsed): string
	{
		if ($percentUsed >= 95.0) {
			return 'critical';
		}
		if ($percentUsed >= 90.0) {
			return 'warning';
		}
		if ($percentUsed >= 75.0) {
			return 'soon';
		}
		return 'ok';
	}

	// ── validators ─────────────────────────────────────────────────────────────

	/** Known component key, or any non-empty free-form string clamped. */
	private static function normComponent(mixed $v): string
	{
		$s = strtolower(trim((string) $v));
		if ($s === '') {
			return '';
		}
		if (isset(self::LIFETIMES[$s])) {
			return $s;
		}
		return mb_substr($s, 0, self::LEN_COMPONENT);
	}

	/** Allowed action, defaulting to 'replaced'. */
	private static function normAction(mixed $v): string
	{
		$s = strtolower(trim((string) $v));
		return in_array($s, self::ACTIONS, true) ? $s : 'replaced';
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

	private static function posFloatOrNull(mixed $v): ?float
	{
		if ($v === null || $v === '' || !is_numeric($v)) {
			return null;
		}
		$n = (float) $v;
		return ($n >= 0 && is_finite($n)) ? $n : null;
	}
}
