<?php

declare(strict_types=1);

namespace OCA\NcPrint\Db;

use OCP\AppFramework\Db\QBMapper;
use OCP\IDBConnection;

/**
 * @template-extends QBMapper<MaintenanceRecord>
 */
class MaintenanceRecordMapper extends QBMapper
{
	public function __construct(IDBConnection $db)
	{
		parent::__construct($db, 'ncprint_maintenance', MaintenanceRecord::class);
	}

	/**
	 * All maintenance rows for a user, newest first. Maintenance rows are few
	 * (one per physical service action), so the summary reduces them in PHP.
	 *
	 * @return MaintenanceRecord[]
	 */
	public function findByUser(string $uid): array
	{
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')
			->from($this->getTableName())
			->where($qb->expr()->eq('uid', $qb->createNamedParameter($uid)))
			->orderBy('at', 'DESC')
			->addOrderBy('id', 'DESC');
		return $this->findEntities($qb);
	}

	/**
	 * Most-recent maintenance row per (printer_id, component) for a user.
	 *
	 * Kept portable: findByUser() already returns rows newest-first, so the
	 * first row seen for a (printer, component) key is the latest. Reducing in
	 * PHP avoids engine-specific GROUP BY MAX() joins and is cheap given the
	 * small row count.
	 *
	 * @return array<string,MaintenanceRecord> keyed by "printerId\0component"
	 */
	public function latestByComponent(string $uid): array
	{
		$latest = [];
		foreach ($this->findByUser($uid) as $row) {
			$key = $row->getPrinterId() . "\0" . $row->getComponent();
			if (!isset($latest[$key])) {
				$latest[$key] = $row;
			}
		}
		return $latest;
	}
}
