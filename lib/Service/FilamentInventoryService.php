<?php

declare(strict_types=1);

namespace OCA\NcPrint\Service;

use OCA\NcPrint\Db\Spool;
use OCA\NcPrint\Db\SpoolMapper;
use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Utility\ITimeFactory;
use Psr\Log\LoggerInterface;

/**
 * Filament/spool inventory — a standalone pillar, one row per physical spool
 * per user. Every read/write is best-effort: a DB failure is logged and
 * swallowed so it can never surface as a UI error, matching the contract used
 * by PrintHistoryService.
 *
 * All string inputs are trimmed and clamped to their column lengths; weights
 * are non-negative floats; color_hex is normalized to a #RRGGBB form or dropped.
 */
class FilamentInventoryService
{
	/** Column lengths (mirrors the migration) used for clamping. */
	private const LEN_BRAND = 128;
	private const LEN_MATERIAL = 64;
	private const LEN_COLOR_NAME = 64;
	private const LEN_CURRENCY = 8;
	private const LEN_LOCATION = 128;
	private const LEN_NOTES = 512;

	public function __construct(
		private SpoolMapper $mapper,
		private ITimeFactory $time,
		private LoggerInterface $logger,
	) {
	}

	/**
	 * All spools for a user plus a summary roll-up.
	 *
	 * @return array{spools:array,summary:array{count:int,total_remaining_g:float,total_cost:float,low_stock:int}}
	 */
	public function list(string $uid, bool $includeArchived = false): array
	{
		try {
			$rows = $this->mapper->findByUser($uid, $includeArchived);
		} catch (\Throwable $e) {
			$this->logger->warning('nc_print filament list failed', ['exception' => $e]);
			$rows = [];
		}

		$spools = [];
		$totalRemaining = 0.0;
		$totalCost = 0.0;
		$lowStock = 0;
		foreach ($rows as $row) {
			$json = $row->jsonSerialize();
			$spools[] = $json;
			$totalRemaining += (float) $json['weight_remaining_g'];
			if ($json['cost'] !== null) {
				$totalCost += (float) $json['cost'];
			}
			if (!empty($json['low_stock'])) {
				$lowStock++;
			}
		}

		return [
			'spools' => $spools,
			'summary' => [
				'count' => count($spools),
				'total_remaining_g' => round($totalRemaining, 1),
				'total_cost' => round($totalCost, 2),
				'low_stock' => $lowStock,
			],
		];
	}

	/**
	 * Create a spool. Returns the stored row, or null if the insert failed
	 * (never throws to the caller).
	 *
	 * @param array<string,mixed> $data
	 */
	public function create(string $uid, array $data): ?array
	{
		$uid = trim($uid);
		if ($uid === '') {
			return null;
		}
		try {
			$now = $this->time->getTime();
			$spool = new Spool();
			$spool->setUid($uid);
			$spool->setBrand(self::clampStr($data['brand'] ?? '', self::LEN_BRAND));
			$spool->setMaterial(self::clampStr($data['material'] ?? '', self::LEN_MATERIAL));
			$spool->setColorName(self::clampStrOrNull($data['color_name'] ?? null, self::LEN_COLOR_NAME));
			$spool->setColorHex(self::normHex($data['color_hex'] ?? null));
			$spool->setDiameter(self::posFloatOrNull($data['diameter'] ?? null));

			$total = self::posFloatOrNull($data['weight_total_g'] ?? null) ?? 1000.0;
			$remaining = self::posFloatOrNull($data['weight_remaining_g'] ?? null);
			if ($remaining === null) {
				$remaining = $total;
			}
			$spool->setWeightTotalG($total);
			$spool->setWeightRemainingG($remaining);

			$spool->setCost(self::posFloatOrNull($data['cost'] ?? null));
			$spool->setCurrency(self::clampStrOrNull($data['currency'] ?? null, self::LEN_CURRENCY));
			$spool->setLocation(self::clampStrOrNull($data['location'] ?? null, self::LEN_LOCATION));
			$spool->setNotes(self::clampStrOrNull($data['notes'] ?? null, self::LEN_NOTES));
			$spool->setArchived(self::boolInt($data['archived'] ?? 0));
			$spool->setCreatedAt($now);
			$spool->setUpdatedAt($now);

			return $this->mapper->insert($spool)->jsonSerialize();
		} catch (\Throwable $e) {
			$this->logger->warning('nc_print filament create failed', ['exception' => $e]);
			return null;
		}
	}

	/**
	 * Update a spool owned by the user. Only the provided fields are applied
	 * (with the same validation as create). Returns the stored row, or null if
	 * the spool does not exist / is not owned / the update failed.
	 *
	 * @param array<string,mixed> $data
	 */
	public function update(string $uid, int $id, array $data): ?array
	{
		try {
			$spool = $this->mapper->findForUser($id, $uid);
		} catch (DoesNotExistException $e) {
			return null;
		} catch (\Throwable $e) {
			$this->logger->warning('nc_print filament update lookup failed', ['exception' => $e]);
			return null;
		}

		try {
			if (array_key_exists('brand', $data)) {
				$spool->setBrand(self::clampStr($data['brand'] ?? '', self::LEN_BRAND));
			}
			if (array_key_exists('material', $data)) {
				$spool->setMaterial(self::clampStr($data['material'] ?? '', self::LEN_MATERIAL));
			}
			if (array_key_exists('color_name', $data)) {
				$spool->setColorName(self::clampStrOrNull($data['color_name'] ?? null, self::LEN_COLOR_NAME));
			}
			if (array_key_exists('color_hex', $data)) {
				$spool->setColorHex(self::normHex($data['color_hex'] ?? null));
			}
			if (array_key_exists('diameter', $data)) {
				$spool->setDiameter(self::posFloatOrNull($data['diameter'] ?? null));
			}
			if (array_key_exists('weight_total_g', $data)) {
				$total = self::posFloatOrNull($data['weight_total_g'] ?? null);
				if ($total !== null) {
					$spool->setWeightTotalG($total);
				}
			}
			if (array_key_exists('weight_remaining_g', $data)) {
				$remaining = self::posFloatOrNull($data['weight_remaining_g'] ?? null);
				if ($remaining !== null) {
					$spool->setWeightRemainingG($remaining);
				}
			}
			if (array_key_exists('cost', $data)) {
				$spool->setCost(self::posFloatOrNull($data['cost'] ?? null));
			}
			if (array_key_exists('currency', $data)) {
				$spool->setCurrency(self::clampStrOrNull($data['currency'] ?? null, self::LEN_CURRENCY));
			}
			if (array_key_exists('location', $data)) {
				$spool->setLocation(self::clampStrOrNull($data['location'] ?? null, self::LEN_LOCATION));
			}
			if (array_key_exists('notes', $data)) {
				$spool->setNotes(self::clampStrOrNull($data['notes'] ?? null, self::LEN_NOTES));
			}
			if (array_key_exists('archived', $data)) {
				$spool->setArchived(self::boolInt($data['archived'] ?? 0));
			}
			$spool->setUpdatedAt($this->time->getTime());

			return $this->mapper->update($spool)->jsonSerialize();
		} catch (\Throwable $e) {
			$this->logger->warning('nc_print filament update failed', ['exception' => $e]);
			return null;
		}
	}

	/** Delete a spool owned by the user. Returns true if a row was removed. */
	public function delete(string $uid, int $id): bool
	{
		try {
			return $this->mapper->deleteForUser($id, $uid) > 0;
		} catch (\Throwable $e) {
			$this->logger->warning('nc_print filament delete failed', ['exception' => $e]);
			return false;
		}
	}

	// ── validators ─────────────────────────────────────────────────────────────

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

	/** Normalize to #RRGGBB (lower-case), or null if not a 6-hex-digit color. */
	private static function normHex(mixed $v): ?string
	{
		$s = trim((string) ($v ?? ''));
		if ($s === '') {
			return null;
		}
		if (!preg_match('/^#?[0-9a-fA-F]{6}$/', $s)) {
			return null;
		}
		$hex = ltrim($s, '#');
		return '#' . strtolower($hex);
	}

	private static function boolInt(mixed $v): int
	{
		if (is_bool($v)) {
			return $v ? 1 : 0;
		}
		if (is_numeric($v)) {
			return (int) $v !== 0 ? 1 : 0;
		}
		$s = strtolower(trim((string) $v));
		return in_array($s, ['1', 'true', 'yes', 'on'], true) ? 1 : 0;
	}
}
