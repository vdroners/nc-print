<?php

declare(strict_types=1);

namespace OCA\NcPrint\Dashboard;

use OCA\NcPrint\AppInfo\Application;
use OCP\Dashboard\IWidget;
use OCP\IL10N;
use OCP\IURLGenerator;
use OCP\Util;

/**
 * Dashboard widget showing the active printer's status at a glance.
 *
 * Renders a mount point that the `dashboard` frontend entry fills with a small
 * Vue component reading /api/printer/state (+ /api/eta). Deep-links into the
 * app. Kept as a script-mounted IWidget for broad NC 28–33 compatibility.
 */
class PrinterStatusWidget implements IWidget
{
	public function __construct(
		private IL10N $l,
		private IURLGenerator $url,
	) {
	}

	public function getId(): string
	{
		return 'nc_print_printer_status';
	}

	public function getTitle(): string
	{
		return $this->l->t('3D printer status');
	}

	public function getOrder(): int
	{
		return 30;
	}

	public function getIconClass(): string
	{
		return 'icon-nc-print-dashboard';
	}

	public function getUrl(): ?string
	{
		return $this->url->linkToRouteAbsolute(Application::APP_ID . '.page.index');
	}

	public function load(): void
	{
		Util::addScript(Application::APP_ID, Application::APP_ID . '-dashboard');
		Util::addStyle(Application::APP_ID, 'nc-print-theme');
	}
}
