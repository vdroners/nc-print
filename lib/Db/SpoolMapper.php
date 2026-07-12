<?php

declare(strict_types=1);

namespace OCA\NcPrint\Db;

use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Db\QBMapper;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IDBConnection;

/**
 * @template-extends QBMapper<Spool>
 */
class SpoolMapper extends QBMapper
{
	public function __construct(IDBConnection $db)
	{
		parent::__construct($db, 'ncprint_spools', Spool::class);
	}

	/**
	 * One spool scoped to its owner (id AND uid) so a user can never read
	 * another user's spool (IDOR-safe).
	 *
	 * @throws DoesNotExistException
	 */
	public function findForUser(int $id, string $uid): Spool
	{
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')
			->from($this->getTableName())
			->where($qb->expr()->eq('id', $qb->createNamedParameter($id, IQueryBuilder::PARAM_INT)))
			->andWhere($qb->expr()->eq('uid', $qb->createNamedParameter($uid)));
		return $this->findEntity($qb);
	}

	/**
	 * Inventory rows for a user, newest-updated first. Archived spools are
	 * excluded unless $includeArchived is set.
	 *
	 * @return Spool[]
	 */
	public function findByUser(string $uid, bool $includeArchived = false): array
	{
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')
			->from($this->getTableName())
			->where($qb->expr()->eq('uid', $qb->createNamedParameter($uid)));
		if (!$includeArchived) {
			$qb->andWhere($qb->expr()->eq('archived', $qb->createNamedParameter(0, IQueryBuilder::PARAM_INT)));
		}
		$qb->orderBy('updated_at', 'DESC')
			->addOrderBy('id', 'DESC');
		return $this->findEntities($qb);
	}

	/** Delete one spool scoped to its owner. Returns rows affected. */
	public function deleteForUser(int $id, string $uid): int
	{
		$qb = $this->db->getQueryBuilder();
		$qb->delete($this->getTableName())
			->where($qb->expr()->eq('id', $qb->createNamedParameter($id, IQueryBuilder::PARAM_INT)))
			->andWhere($qb->expr()->eq('uid', $qb->createNamedParameter($uid)));
		return $qb->executeStatement();
	}
}
