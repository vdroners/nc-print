<?php

declare(strict_types=1);

namespace OCA\NcPrint\Listener;

use OCA\Files\Event\LoadAdditionalScriptsEvent;
use OCA\NcPrint\AppInfo\Application;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\Util;

/**
 * Inject Files-app "Open in NC 3D Print" for STL/3MF/OBJ/G-code.
 */
class LoadFilesActions implements IEventListener
{
	#[\Override]
	public function handle(Event $event): void
	{
		if (!$event instanceof LoadAdditionalScriptsEvent) {
			return;
		}

		Util::addInitScript(Application::APP_ID, Application::APP_ID . '-files-action');
	}
}
