<?php

declare(strict_types=1);

namespace OCA\NcPrint\Service;

use OCA\NcPrint\AppInfo\Application;
use OCP\IConfig;

class ConfigService
{
	public const KEY_SLICER_INTERNAL_URL = 'slicer_internal_url';
	public const KEY_MOONRAKER_INTERNAL_URL = 'moonraker_internal_url';
	public const KEY_MOONRAKER_CAMERA_URL = 'moonraker_camera_url';
	public const KEY_SLICER_ENABLED = 'slicer_enabled';
	public const KEY_MOONRAKER_ENABLED = 'moonraker_enabled';
	public const KEY_PRINTER_DISPLAY_NAME = 'printer_display_name';
	public const KEY_ALLOWED_GROUPS = 'allowed_groups';

	/** Reachable from cloud_app via host.docker.internal or bridge gateway. */
	public const DEFAULT_SLICER_INTERNAL_URL = 'http://host.docker.internal:8766';
	public const DEFAULT_MOONRAKER_INTERNAL_URL = 'http://10.0.0.210:7125';
	public const DEFAULT_MOONRAKER_CAMERA_URL = 'http://10.0.0.210:8080/?action=snapshot';
	public const DEFAULT_PRINTER_DISPLAY_NAME = 'K1 Max';
	public const DEFAULT_ALLOWED_GROUPS = '19 Labs';

	public function __construct(
		private IConfig $config,
		private InternalUrlResolver $internalUrlResolver,
	) {
	}

	public function getSlicerInternalUrl(): string
	{
		return $this->internalUrlResolver->resolveSlicerUrl(
			$this->getUrl(
				self::KEY_SLICER_INTERNAL_URL,
				self::DEFAULT_SLICER_INTERNAL_URL,
			),
		);
	}

	public function getMoonrakerInternalUrl(): string
	{
		return $this->internalUrlResolver->resolveUrl(
			$this->getUrl(
				self::KEY_MOONRAKER_INTERNAL_URL,
				self::DEFAULT_MOONRAKER_INTERNAL_URL,
			),
		);
	}

	public function getMoonrakerCameraUrl(): string
	{
		return $this->getUrl(
			self::KEY_MOONRAKER_CAMERA_URL,
			self::DEFAULT_MOONRAKER_CAMERA_URL,
		);
	}

	public function isSlicerEnabled(): bool
	{
		return $this->isEnabledFlag(
			self::KEY_SLICER_ENABLED,
			true,
		);
	}

	public function isMoonrakerEnabled(): bool
	{
		return $this->isEnabledFlag(
			self::KEY_MOONRAKER_ENABLED,
			true,
		);
	}

	public function getPrinterDisplayName(): string
	{
		$v = trim($this->config->getAppValue(
			Application::APP_ID,
			self::KEY_PRINTER_DISPLAY_NAME,
			'',
		));
		return $v !== '' ? $v : self::DEFAULT_PRINTER_DISPLAY_NAME;
	}

	/** @return list<string> */
	public function getAllowedGroups(): array
	{
		$raw = $this->config->getAppValue(
			Application::APP_ID,
			self::KEY_ALLOWED_GROUPS,
			self::DEFAULT_ALLOWED_GROUPS,
		);
		return self::parseGroupList($raw);
	}

	/** @return list<string> */
	public static function parseGroupList(string $raw): array
	{
		$parts = preg_split('/[\s,]+/', $raw, -1, PREG_SPLIT_NO_EMPTY);
		if (!is_array($parts)) {
			return [];
		}
		return array_values(array_unique($parts));
	}

	/** @return array<string, mixed> */
	public function publicBootstrap(): array
	{
		return [
			'app_id' => Application::APP_ID,
			'slicer_enabled' => $this->isSlicerEnabled(),
			'moonraker_enabled' => $this->isMoonrakerEnabled(),
			'printer_display_name' => $this->getPrinterDisplayName(),
			'slicer_proxy_base' => '/apps/' . Application::APP_ID . '/api/slicer',
			'moonraker_proxy_base' => '/apps/' . Application::APP_ID . '/api/moonraker',
			'camera_url' => '/apps/' . Application::APP_ID . '/api/camera/frame.jpeg',
			'ws_ticket_url' => '/apps/' . Application::APP_ID . '/api/ws-ticket',
		];
	}

	private function getUrl(string $key, string $default): string
	{
		$v = trim($this->config->getAppValue(Application::APP_ID, $key, ''));
		return $v !== '' ? $v : $default;
	}

	private function isEnabledFlag(string $key, bool $default): bool
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
