<?php

declare(strict_types=1);

namespace OCA\NcPrint\Listener;

use OCA\NcPrint\AppInfo\Application;
use OCP\App\Events\AppUninstallEvent;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\IConfig;

/**
 * Remove all nc_print appconfig on uninstall (store rule: clean up after themselves).
 *
 * @template-implements IEventListener<AppUninstallEvent>
 */
class UninstallCleanupListener implements IEventListener
{
	public function __construct(
		private IConfig $config,
	) {
	}

	public function handle(Event $event): void
	{
		if (!$event instanceof AppUninstallEvent || $event->getAppId() !== Application::APP_ID) {
			return;
		}

		$this->config->deleteAppValues(Application::APP_ID);
	}
}
