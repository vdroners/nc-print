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
	public const KEY_MULTI_PRINTERS = 'multi_printers';
	/** WS11 G-code console: arbitrary command send. Default OFF. */
	public const KEY_CONSOLE_ENABLED = 'console_enabled';

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

	/**
	 * WS11: whether the arbitrary G-code console send path is enabled.
	 * Security-sensitive — defaults OFF and must be explicitly turned on by
	 * an administrator.
	 */
	public function isConsoleEnabled(): bool
	{
		return $this->isEnabledFlag(
			self::KEY_CONSOLE_ENABLED,
			false,
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

	/**
	 * @return list<array<string, mixed>>
	 */
	public function getMultiPrinters(): array
	{
		$raw = trim($this->config->getAppValue(
			Application::APP_ID,
			self::KEY_MULTI_PRINTERS,
			'',
		));
		if ($raw === '') {
			return [[
				'id' => 'default',
				'name' => $this->getPrinterDisplayName(),
				'moonraker_url' => $this->getMoonrakerInternalUrl(),
				'camera_url' => $this->getMoonrakerCameraUrl(),
				'default' => true,
			]];
		}
		$decoded = json_decode($raw, true);
		if (!is_array($decoded)) {
			return [[
				'id' => 'default',
				'name' => $this->getPrinterDisplayName(),
				'moonraker_url' => $this->getMoonrakerInternalUrl(),
				'camera_url' => $this->getMoonrakerCameraUrl(),
				'default' => true,
			]];
		}
		$out = [];
		foreach ($decoded as $row) {
			if (!is_array($row) || !isset($row['id']) || !is_string($row['id']) || $row['id'] === '') {
				continue;
			}
			$out[] = $row;
		}
		return $out !== [] ? $out : [[
			'id' => 'default',
			'name' => $this->getPrinterDisplayName(),
			'moonraker_url' => $this->getMoonrakerInternalUrl(),
			'camera_url' => $this->getMoonrakerCameraUrl(),
			'default' => true,
		]];
	}

	/**
	 * @return array<string, mixed>|null
	 */
	public function getMultiPrinterById(?string $id): ?array
	{
		if ($id === null || $id === '') {
			foreach ($this->getMultiPrinters() as $row) {
				if (!empty($row['default'])) {
					return $row;
				}
			}
			$all = $this->getMultiPrinters();
			return $all[0] ?? null;
		}
		foreach ($this->getMultiPrinters() as $row) {
			if (($row['id'] ?? '') === $id) {
				return $row;
			}
		}
		return null;
	}

	public function resolveMoonrakerUrl(?string $printerId = null): string
	{
		$row = $this->getMultiPrinterById($printerId);
		if ($row !== null && isset($row['moonraker_url']) && is_string($row['moonraker_url']) && trim($row['moonraker_url']) !== '') {
			return $this->internalUrlResolver->resolveUrl(trim($row['moonraker_url']));
		}
		return $this->getMoonrakerInternalUrl();
	}

	public function resolveCameraUrl(?string $printerId = null): string
	{
		$row = $this->getMultiPrinterById($printerId);
		if ($row !== null && isset($row['camera_url']) && is_string($row['camera_url']) && trim($row['camera_url']) !== '') {
			return trim($row['camera_url']);
		}
		return $this->getMoonrakerCameraUrl();
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
			'console_enabled' => $this->isConsoleEnabled(),
			'printer_display_name' => $this->getPrinterDisplayName(),
			'multi_printers' => $this->getMultiPrinters(),
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
