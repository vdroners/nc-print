<?php

declare(strict_types=1);

namespace OCA\NcPrint\Db;

use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Db\QBMapper;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IDBConnection;

/**
 * @template-extends QBMapper<PrintRecord>
 */
class PrintRecordMapper extends QBMapper
{
	public function __construct(IDBConnection $db)
	{
		parent::__construct($db, 'ncprint_prints', PrintRecord::class);
	}

	/**
	 * @throws DoesNotExistException
	 */
	public function findForUser(int $id, string $uid): PrintRecord
	{
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')
			->from($this->getTableName())
			->where($qb->expr()->eq('id', $qb->createNamedParameter($id, IQueryBuilder::PARAM_INT)))
			->andWhere($qb->expr()->eq('uid', $qb->createNamedParameter($uid)));
		return $this->findEntity($qb);
	}

	/**
	 * History rows for a user, newest first, with optional filters.
	 *
	 * @param array{printer_id?:string,material?:string,result?:string,from?:int,to?:int} $filters
	 * @return PrintRecord[]
	 */
	public function findByUser(string $uid, int $limit, int $offset, array $filters = []): array
	{
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')
			->from($this->getTableName())
			->where($qb->expr()->eq('uid', $qb->createNamedParameter($uid)));
		$this->applyFilters($qb, $filters);
		$qb->orderBy('ended_at', 'DESC')
			->addOrderBy('id', 'DESC')
			->setMaxResults(max(1, min(500, $limit)))
			->setFirstResult(max(0, $offset));
		return $this->findEntities($qb);
	}

	/** Total rows matching a user + filters (for pagination). */
	public function countByUser(string $uid, array $filters = []): int
	{
		$qb = $this->db->getQueryBuilder();
		$qb->select($qb->func()->count('*', 'cnt'))
			->from($this->getTableName())
			->where($qb->expr()->eq('uid', $qb->createNamedParameter($uid)));
		$this->applyFilters($qb, $filters);
		$row = $qb->executeQuery()->fetch();
		return (int) ($row['cnt'] ?? 0);
	}

	/**
	 * Per-(printer, material) aggregate rows for quality metrics. Kept portable
	 * (COUNT/SUM/AVG only) — median + eta stdev are computed in PHP from the
	 * duration/ratio pulls below, since percentile SQL differs across engines.
	 *
	 * @return array<int,array<string,mixed>>
	 */
	public function aggregateByPrinterMaterial(string $uid): array
	{
		$qb = $this->db->getQueryBuilder();
		$qb->select('printer_id', 'material')
			->selectAlias($qb->func()->count('*'), 'total')
			->selectAlias($qb->func()->sum('duration_s'), 'sum_duration')
			->selectAlias($qb->func()->sum('filament_g'), 'sum_filament')
			->from($this->getTableName())
			->where($qb->expr()->eq('uid', $qb->createNamedParameter($uid)))
			->groupBy('printer_id', 'material');
		return $qb->executeQuery()->fetchAll();
	}

	/**
	 * Result counts per printer (complete/error/cancel) for success rate.
	 *
	 * @return array<int,array<string,mixed>>
	 */
	public function resultCountsByPrinter(string $uid): array
	{
		$qb = $this->db->getQueryBuilder();
		$qb->select('printer_id', 'result')
			->selectAlias($qb->func()->count('*'), 'cnt')
			->from($this->getTableName())
			->where($qb->expr()->eq('uid', $qb->createNamedParameter($uid)))
			->groupBy('printer_id', 'result');
		return $qb->executeQuery()->fetchAll();
	}

	/**
	 * (duration_s, slicer_duration_s) pairs where both are present, for ETA
	 * accuracy + median. Capped to keep the PHP-side compute bounded.
	 *
	 * @return array<int,array{printer_id:string,duration_s:int,slicer_duration_s:?int}>
	 */
	public function durationPairs(string $uid, int $cap = 2000): array
	{
		$qb = $this->db->getQueryBuilder();
		$qb->select('printer_id', 'duration_s', 'slicer_duration_s')
			->from($this->getTableName())
			->where($qb->expr()->eq('uid', $qb->createNamedParameter($uid)))
			->andWhere($qb->expr()->gt('duration_s', $qb->createNamedParameter(0, IQueryBuilder::PARAM_INT)))
			->orderBy('ended_at', 'DESC')
			->setMaxResults(max(1, $cap));
		return $qb->executeQuery()->fetchAll();
	}

	/**
	 * Recent terminated prints for time-series analytics: ended timestamp,
	 * duration, filament grams and result. Bucketed into weeks in PHP so the SQL
	 * stays portable. Newest first, capped.
	 *
	 * @return array<int,array<string,mixed>>
	 */
	public function analyticsRows(string $uid, int $cap = 5000): array
	{
		$qb = $this->db->getQueryBuilder();
		$qb->select('ended_at', 'duration_s', 'filament_g', 'result', 'material')
			->from($this->getTableName())
			->where($qb->expr()->eq('uid', $qb->createNamedParameter($uid)))
			->orderBy('ended_at', 'DESC')
			->setMaxResults(max(1, $cap));
		return $qb->executeQuery()->fetchAll();
	}

	/**
	 * Per-printer wear totals: cumulative print seconds + total filament grams,
	 * plus filament grams restricted to abrasive materials (nozzle-wear proxy).
	 *
	 * @param list<string> $abrasive lower-cased abrasive material tokens
	 * @return array<int,array<string,mixed>>
	 */
	public function wearTotals(string $uid, array $abrasive): array
	{
		$qb = $this->db->getQueryBuilder();
		$qb->select('printer_id')
			->selectAlias($qb->func()->sum('duration_s'), 'sum_duration')
			->selectAlias($qb->func()->sum('filament_g'), 'sum_filament')
			->selectAlias($qb->func()->count('*'), 'total')
			->from($this->getTableName())
			->where($qb->expr()->eq('uid', $qb->createNamedParameter($uid)))
			->groupBy('printer_id');
		$rows = $qb->executeQuery()->fetchAll();

		// Abrasive filament is a separate grouped SUM restricted to the abrasive
		// material set; done as a second query to keep each one portable.
		$abrasiveByPrinter = [];
		if ($abrasive !== []) {
			$qb2 = $this->db->getQueryBuilder();
			$qb2->select('printer_id')
				->selectAlias($qb2->func()->sum('filament_g'), 'sum_abrasive')
				->from($this->getTableName())
				->where($qb2->expr()->eq('uid', $qb2->createNamedParameter($uid)))
				->andWhere($qb2->expr()->in(
					$qb2->func()->lower('material'),
					$qb2->createNamedParameter($abrasive, IQueryBuilder::PARAM_STR_ARRAY),
				))
				->groupBy('printer_id');
			foreach ($qb2->executeQuery()->fetchAll() as $r) {
				$abrasiveByPrinter[(string) $r['printer_id']] = (float) ($r['sum_abrasive'] ?? 0);
			}
		}
		foreach ($rows as &$r) {
			$r['sum_abrasive'] = $abrasiveByPrinter[(string) $r['printer_id']] ?? 0.0;
		}
		return $rows;
	}

	/** Delete one row scoped to its owner. Returns rows affected. */
	public function deleteForUser(int $id, string $uid): int
	{
		$qb = $this->db->getQueryBuilder();
		$qb->delete($this->getTableName())
			->where($qb->expr()->eq('id', $qb->createNamedParameter($id, IQueryBuilder::PARAM_INT)))
			->andWhere($qb->expr()->eq('uid', $qb->createNamedParameter($uid)));
		return $qb->executeStatement();
	}

	/** Delete all rows for a user (uninstall cleanup / clear). Returns count. */
	public function deleteAllForUser(string $uid): int
	{
		$qb = $this->db->getQueryBuilder();
		$qb->delete($this->getTableName())
			->where($qb->expr()->eq('uid', $qb->createNamedParameter($uid)));
		return $qb->executeStatement();
	}

	/**
	 * Apply the shared where-filters to a SELECT/COUNT builder.
	 *
	 * @param array{printer_id?:string,material?:string,result?:string,from?:int,to?:int} $filters
	 */
	private function applyFilters(IQueryBuilder $qb, array $filters): void
	{
		if (!empty($filters['printer_id'])) {
			$qb->andWhere($qb->expr()->eq('printer_id', $qb->createNamedParameter((string) $filters['printer_id'])));
		}
		if (!empty($filters['material'])) {
			$qb->andWhere($qb->expr()->eq('material', $qb->createNamedParameter((string) $filters['material'])));
		}
		if (!empty($filters['result'])) {
			$qb->andWhere($qb->expr()->eq('result', $qb->createNamedParameter((string) $filters['result'])));
		}
		if (!empty($filters['from'])) {
			$qb->andWhere($qb->expr()->gte('ended_at', $qb->createNamedParameter((int) $filters['from'], IQueryBuilder::PARAM_INT)));
		}
		if (!empty($filters['to'])) {
			$qb->andWhere($qb->expr()->lte('ended_at', $qb->createNamedParameter((int) $filters['to'], IQueryBuilder::PARAM_INT)));
		}
	}
}
