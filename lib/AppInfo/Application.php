<?php

declare(strict_types=1);

namespace OCA\NcPrint\AppInfo;

use OCA\Files\Event\LoadAdditionalScriptsEvent;
use OCA\NcPrint\Dashboard\PrinterStatusWidget;
use OCA\NcPrint\Listener\LoadFilesActions;
use OCA\NcPrint\Listener\UninstallCleanupListener;
use OCA\NcPrint\Notification\Notifier;
use OCP\App\Events\AppUninstallEvent;
use OCP\AppFramework\App;
use OCP\AppFramework\Bootstrap\IBootContext;
use OCP\AppFramework\Bootstrap\IBootstrap;
use OCP\AppFramework\Bootstrap\IRegistrationContext;
use OCP\Util;

class Application extends App implements IBootstrap
{
	public const APP_ID = 'nc_print';

	public function __construct()
	{
		parent::__construct(self::APP_ID);
	}

	public function register(IRegistrationContext $context): void
	{
		$context->registerEventListener(
			LoadAdditionalScriptsEvent::class,
			LoadFilesActions::class,
		);
		$context->registerEventListener(
			AppUninstallEvent::class,
			UninstallCleanupListener::class,
		);

		// Native Nextcloud surfaces: notification bell + a Dashboard widget for
		// at-a-glance printer status. The Activity provider/setting are declared
		// in info.xml's <activity> block (there is no bootstrap registrar for
		// them).
		$context->registerNotifierService(Notifier::class);
		$context->registerDashboardWidget(PrinterStatusWidget::class);
	}

	public function boot(IBootContext $context): void
	{
		$context->injectFn(function (): void {
			Util::addStyle(self::APP_ID, 'nc-print-theme');
		});
	}
}
