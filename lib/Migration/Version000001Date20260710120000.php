<?php

declare(strict_types=1);

namespace OCA\NcPrint\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\DB\Types;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/**
 * First schema for nc_print: durable print history.
 *
 * Until now the app was deliberately DB-free (EtaLearningService keeps its
 * per-printer multiplier in a config JSON blob). Print history is unbounded over
 * time and the quality-metrics / wear queries want real SQL aggregation, so
 * history gets a proper table — one row per terminated print, per user.
 *
 * Table: oc_ncprint_prints (Nextcloud prefixes `oc_` automatically). Timestamps
 * are stored as unix-second bigints (portable across sqlite/mysql/pgsql and
 * simplest to aggregate) rather than DATETIME.
 */
class Version000001Date20260710120000 extends SimpleMigrationStep
{
	public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper
	{
		/** @var ISchemaWrapper $schema */
		$schema = $schemaClosure();

		if ($schema->hasTable('ncprint_prints')) {
			return null;
		}

		$t = $schema->createTable('ncprint_prints');

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
		$t->addColumn('printer_name', Types::STRING, [
			'notnull' => false,
			'length' => 255,
		]);
		$t->addColumn('filename', Types::STRING, [
			'notnull' => true,
			'length' => 512,
			'default' => '',
		]);
		$t->addColumn('material', Types::STRING, [
			'notnull' => false,
			'length' => 64,
		]);
		$t->addColumn('nozzle_diameter', Types::FLOAT, [
			'notnull' => false,
		]);
		// complete | error | cancel
		$t->addColumn('result', Types::STRING, [
			'notnull' => true,
			'length' => 16,
			'default' => 'complete',
		]);
		$t->addColumn('failure_reason', Types::STRING, [
			'notnull' => false,
			'length' => 255,
		]);
		$t->addColumn('started_at', Types::BIGINT, [
			'notnull' => false,
			'length' => 20,
		]);
		$t->addColumn('ended_at', Types::BIGINT, [
			'notnull' => true,
			'length' => 20,
			'default' => 0,
		]);
		$t->addColumn('duration_s', Types::INTEGER, [
			'notnull' => true,
			'default' => 0,
		]);
		$t->addColumn('slicer_duration_s', Types::INTEGER, [
			'notnull' => false,
		]);
		$t->addColumn('filament_g', Types::FLOAT, [
			'notnull' => false,
		]);
		$t->addColumn('filament_mm', Types::FLOAT, [
			'notnull' => false,
		]);
		$t->addColumn('layer_height', Types::FLOAT, [
			'notnull' => false,
		]);
		$t->addColumn('created_at', Types::BIGINT, [
			'notnull' => true,
			'length' => 20,
			'default' => 0,
		]);

		$t->setPrimaryKey(['id']);
		$t->addIndex(['uid'], 'ncprint_hist_uid_idx');
		$t->addIndex(['uid', 'printer_id'], 'ncprint_hist_printer_idx');
		$t->addIndex(['uid', 'result'], 'ncprint_hist_result_idx');
		$t->addIndex(['uid', 'ended_at'], 'ncprint_hist_ended_idx');

		return $schema;
	}
}
