<?php

declare(strict_types=1);

namespace OCA\NcPrint\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\DB\Types;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/**
 * Maintenance / wear log for nc_print.
 *
 * A standalone pillar layered on the print-history wear heuristic: one row per
 * maintenance action (replaced/cleaned/inspected/lubricated) on a printer
 * component, per user. The `hours_at` reading is the printer's cumulative
 * print-hours at the moment of the action, so the service can compute
 * hours-since-service by subtracting it from the current wear() print_hours.
 *
 * Timestamps are unix-second bigints to match the print-history / spool tables'
 * portable convention.
 *
 * Table: oc_ncprint_maintenance (Nextcloud prefixes `oc_` automatically).
 */
class Version000003Date20260712130000 extends SimpleMigrationStep
{
	public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper
	{
		/** @var ISchemaWrapper $schema */
		$schema = $schemaClosure();

		if ($schema->hasTable('ncprint_maintenance')) {
			return null;
		}

		$t = $schema->createTable('ncprint_maintenance');

		$t->addColumn('id', Types::BIGINT, [
			'autoincrement' => true,
			'notnull' => true,
			'length' => 20,
		]);
		$t->addColumn('uid', Types::STRING, [
			'notnull' => true,
			'length' => 64,
		]);
		$t->addColumn('printer_id', Types::STRING, [
			'notnull' => true,
			'length' => 128,
			'default' => '',
		]);
		$t->addColumn('component', Types::STRING, [
			'notnull' => true,
			'length' => 64,
			'default' => '',
		]);
		// replaced | cleaned | inspected | lubricated
		$t->addColumn('action', Types::STRING, [
			'notnull' => true,
			'length' => 32,
			'default' => 'replaced',
		]);
		// Print-hours reading when the action happened.
		$t->addColumn('hours_at', Types::FLOAT, [
			'notnull' => false,
		]);
		$t->addColumn('cost', Types::FLOAT, [
			'notnull' => false,
		]);
		$t->addColumn('notes', Types::STRING, [
			'notnull' => false,
			'length' => 512,
		]);
		$t->addColumn('at', Types::BIGINT, [
			'notnull' => true,
			'length' => 20,
			'default' => 0,
		]);

		$t->setPrimaryKey(['id']);
		$t->addIndex(['uid'], 'ncprint_maint_uid_idx');
		$t->addIndex(['uid', 'printer_id'], 'ncprint_maint_printer_idx');
		$t->addIndex(['uid', 'printer_id', 'component'], 'ncprint_maint_comp_idx');

		return $schema;
	}
}
