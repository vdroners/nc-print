<?php

declare(strict_types=1);

namespace OCA\NcPrint\AppInfo;

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
	}

	public function boot(IBootContext $context): void
	{
		$context->injectFn(function (): void {
			Util::addStyle(self::APP_ID, 'nc-print-theme');
		});
	}
}
