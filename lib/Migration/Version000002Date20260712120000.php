<?php

declare(strict_types=1);

namespace OCA\NcPrint\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\DB\Types;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/**
 * Filament/spool inventory table for nc_print.
 *
 * A standalone pillar: one row per physical spool, per user. Weights are stored
 * in grams (float) so partial-spool tracking stays simple; cost is an optional
 * float with a free-form currency tag. Timestamps are unix-second bigints to
 * match the print-history table's portable convention.
 *
 * Table: oc_ncprint_spools (Nextcloud prefixes `oc_` automatically).
 */
class Version000002Date20260712120000 extends SimpleMigrationStep
{
	public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper
	{
		/** @var ISchemaWrapper $schema */
		$schema = $schemaClosure();

		if ($schema->hasTable('ncprint_spools')) {
			return null;
		}

		$t = $schema->createTable('ncprint_spools');

		$t->addColumn('id', Types::BIGINT, [
			'autoincrement' => true,
			'notnull' => true,
			'length' => 20,
		]);
		$t->addColumn('uid', Types::STRING, [
			'notnull' => true,
			'length' => 64,
		]);
		$t->addColumn('brand', Types::STRING, [
			'notnull' => true,
			'length' => 128,
			'default' => '',
		]);
		$t->addColumn('material', Types::STRING, [
			'notnull' => true,
			'length' => 64,
			'default' => '',
		]);
		$t->addColumn('color_name', Types::STRING, [
			'notnull' => false,
			'length' => 64,
		]);
		$t->addColumn('color_hex', Types::STRING, [
			'notnull' => false,
			'length' => 9,
		]);
		$t->addColumn('diameter', Types::FLOAT, [
			'notnull' => false,
		]);
		$t->addColumn('weight_total_g', Types::FLOAT, [
			'notnull' => true,
			'default' => 1000,
		]);
		$t->addColumn('weight_remaining_g', Types::FLOAT, [
			'notnull' => true,
			'default' => 1000,
		]);
		$t->addColumn('cost', Types::FLOAT, [
			'notnull' => false,
		]);
		$t->addColumn('currency', Types::STRING, [
			'notnull' => false,
			'length' => 8,
		]);
		$t->addColumn('location', Types::STRING, [
			'notnull' => false,
			'length' => 128,
		]);
		$t->addColumn('notes', Types::STRING, [
			'notnull' => false,
			'length' => 512,
		]);
		// bool 0/1
		$t->addColumn('archived', Types::INTEGER, [
			'notnull' => true,
			'default' => 0,
		]);
		$t->addColumn('created_at', Types::BIGINT, [
			'notnull' => true,
			'length' => 20,
			'default' => 0,
		]);
		$t->addColumn('updated_at', Types::BIGINT, [
			'notnull' => true,
			'length' => 20,
			'default' => 0,
		]);

		$t->setPrimaryKey(['id']);
		$t->addIndex(['uid'], 'ncprint_spool_uid_idx');
		$t->addIndex(['uid', 'archived'], 'ncprint_spool_arch_idx');

		return $schema;
	}
}
