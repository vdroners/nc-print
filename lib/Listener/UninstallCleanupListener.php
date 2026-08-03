<?php

declare(strict_types=1);

namespace OCA\NcPrint\Listener;

use OCA\NcPrint\AppInfo\Application;
use OCP\App\Events\AppUninstallEvent;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\IConfig;
use OCP\IDBConnection;

/**
 * Drop ncprint_* tables and appconfig on uninstall (store rule: clean up after themselves).
 *
 * @template-implements IEventListener<AppUninstallEvent>
 */
class UninstallCleanupListener implements IEventListener
{
	private const TABLES = [
		'ncprint_prints',
		'ncprint_spools',
		'ncprint_maintenance',
	];

	public function __construct(
		private IConfig $config,
		private IDBConnection $db,
	) {
	}

	public function handle(Event $event): void
	{
		if (!$event instanceof AppUninstallEvent || $event->getAppId() !== Application::APP_ID) {
			return;
		}

		$prefix = $this->db->getPrefix();
		foreach (self::TABLES as $table) {
			$this->db->executeStatement('DROP TABLE IF EXISTS `' . $prefix . $table . '`');
		}

		$this->config->deleteAppValues(Application::APP_ID);
	}
}
