<?php

declare(strict_types=1);

namespace OCA\NcPrint\Settings;

use OCA\NcPrint\AppInfo\Application;
use OCA\NcPrint\Service\ConfigService;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\IConfig;
use OCP\IURLGenerator;
use OCP\Settings\ISettings;
use OCP\Util;

class AdminSettings implements ISettings
{
	public function __construct(
		private IConfig $config,
		private IURLGenerator $urlGenerator,
	) {
	}

	public function getForm(): TemplateResponse
	{
		Util::addScript(Application::APP_ID, 'nc_print-admin');

		$params = [
			ConfigService::KEY_SLICER_INTERNAL_URL => $this->getString(
				ConfigService::KEY_SLICER_INTERNAL_URL,
				ConfigService::DEFAULT_SLICER_INTERNAL_URL,
			),
			ConfigService::KEY_MOONRAKER_INTERNAL_URL => $this->getString(
				ConfigService::KEY_MOONRAKER_INTERNAL_URL,
				ConfigService::DEFAULT_MOONRAKER_INTERNAL_URL,
			),
			ConfigService::KEY_MOONRAKER_CAMERA_URL => $this->getString(
				ConfigService::KEY_MOONRAKER_CAMERA_URL,
				ConfigService::DEFAULT_MOONRAKER_CAMERA_URL,
			),
			ConfigService::KEY_PRINTER_DISPLAY_NAME => $this->getString(
				ConfigService::KEY_PRINTER_DISPLAY_NAME,
				ConfigService::DEFAULT_PRINTER_DISPLAY_NAME,
			),
			ConfigService::KEY_ALLOWED_GROUPS => $this->getString(
				ConfigService::KEY_ALLOWED_GROUPS,
				ConfigService::DEFAULT_ALLOWED_GROUPS,
			),
			ConfigService::KEY_MULTI_PRINTERS => $this->getString(
				ConfigService::KEY_MULTI_PRINTERS,
				'',
			),
			ConfigService::KEY_SLICER_ENABLED => $this->isEnabled(
				ConfigService::KEY_SLICER_ENABLED,
				true,
			),
			ConfigService::KEY_MOONRAKER_ENABLED => $this->isEnabled(
				ConfigService::KEY_MOONRAKER_ENABLED,
				true,
			),
			'save_url' => $this->urlGenerator->linkToRoute(
				'nc_print.admin.saveSettings',
			),
			'discover_url' => $this->urlGenerator->linkToRoute(
				'nc_print.admin.discoverPrinters',
			),
		];

		return new TemplateResponse(Application::APP_ID, 'admin_settings', $params);
	}

	public function getSection(): string
	{
		return Application::APP_ID;
	}

	public function getPriority(): int
	{
		return 10;
	}

	private function getString(string $key, string $default): string
	{
		$v = trim($this->config->getAppValue(Application::APP_ID, $key, ''));
		return $v !== '' ? $v : $default;
	}

	private function isEnabled(string $key, bool $default): bool
	{
		$raw = strtolower(trim($this->config->getAppValue(Application::APP_ID, $key, '')));
		if ($raw === '') {
			return $default;
		}
		if (in_array($raw, ['0', 'false', 'no', 'off'], true)) {
			return false;
		}
		if (in_array($raw, ['1', 'true', 'yes', 'on'], true)) {
			return true;
		}
		return $default;
	}
}
