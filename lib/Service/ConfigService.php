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

	/**
	 * Owned slicing engine sidecar (nc-print-slicer), reached by container DNS
	 * over the shared nc-print-net network. Addressing it by container name
	 * bypasses the host.docker.internal / :8766 rewrite hacks in
	 * InternalUrlResolver. Operators can still point at an external
	 * forge-slicer by setting the slicer_internal_url app value.
	 */
	/** Docker-compose idiom when operator deploys the nc-print-slicer sidecar separately. */
	public const DEFAULT_SLICER_INTERNAL_URL = 'http://nc-print-slicer:8080';
	public const DEFAULT_MOONRAKER_INTERNAL_URL = '';
	public const DEFAULT_MOONRAKER_CAMERA_URL = '';
	public const DEFAULT_PRINTER_DISPLAY_NAME = '3D Printer';
	/** Empty = administrators only until groups are configured in Admin settings. */
	public const DEFAULT_ALLOWED_GROUPS = '';

	public function __construct(
		private IConfig $config,
		private InternalUrlResolver $internalUrlResolver,
		private SessionPrinterService $sessionPrinters,
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
		$session = $this->sessionPrinters->list();
		$raw = trim($this->config->getAppValue(
			Application::APP_ID,
			self::KEY_MULTI_PRINTERS,
			'',
		));
		if ($raw !== '') {
			$decoded = json_decode($raw, true);
			if (is_array($decoded)) {
				$out = [];
				foreach ($decoded as $row) {
					if (!is_array($row) || !isset($row['id']) || !is_string($row['id']) || $row['id'] === '') {
						continue;
					}
					$out[] = $row;
				}
				if ($out !== []) {
					return $out;
				}
			}
		}
		if ($session !== []) {
			return $session;
		}
		if ($this->hasPersistedMoonrakerUrl()) {
			return [[
				'id' => 'default',
				'name' => $this->getPrinterDisplayName(),
				'moonraker_url' => $this->getMoonrakerInternalUrl(),
				'camera_url' => $this->getMoonrakerCameraUrl(),
				'default' => true,
			]];
		}

		return [];
	}

	private function hasPersistedMoonrakerUrl(): bool
	{
		return trim($this->config->getAppValue(
			Application::APP_ID,
			self::KEY_MOONRAKER_INTERNAL_URL,
			'',
		)) !== '';
	}

	public function isMoonrakerConfigured(): bool
	{
		if (trim($this->config->getAppValue(
			Application::APP_ID,
			self::KEY_MOONRAKER_INTERNAL_URL,
			'',
		)) !== '') {
			return true;
		}
		$raw = trim($this->config->getAppValue(
			Application::APP_ID,
			self::KEY_MULTI_PRINTERS,
			'',
		));
		if ($raw !== '') {
			$decoded = json_decode($raw, true);
			if (is_array($decoded) && $decoded !== []) {
				return true;
			}
		}
		return $this->sessionPrinters->list() !== [];
	}

	public function isSlicerConfigured(): bool
	{
		if (trim($this->config->getAppValue(
			Application::APP_ID,
			self::KEY_SLICER_INTERNAL_URL,
			'',
		)) !== '') {
			return true;
		}
		// Default sidecar URL is valid when the compose stack is deployed; avoid
		// a false "Slicer not configured" when the operator never typed Admin URL.
		return $this->isSlicerEnabled() && trim(self::DEFAULT_SLICER_INTERNAL_URL) !== '';
	}

	/**
	 * Moonraker URL for the global status probe (first configured or session printer).
	 */
	public function resolveMoonrakerProbeUrl(?string $printerId = null): string
	{
		if ($printerId !== null && $printerId !== '') {
			try {
				return $this->resolveMoonrakerUrlOrFail($printerId);
			} catch (\InvalidArgumentException) {
				// Fall through to first available printer.
			}
		}
		foreach ($this->sessionPrinters->list() as $row) {
			if (isset($row['moonraker_url']) && is_string($row['moonraker_url']) && trim($row['moonraker_url']) !== '') {
				return $this->internalUrlResolver->resolveUrl(trim($row['moonraker_url']));
			}
		}
		foreach ($this->getMultiPrinters() as $row) {
			if (isset($row['moonraker_url']) && is_string($row['moonraker_url']) && trim($row['moonraker_url']) !== '') {
				return $this->internalUrlResolver->resolveUrl(trim($row['moonraker_url']));
			}
		}
		return $this->getMoonrakerInternalUrl();
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
		return $this->sessionPrinters->getById($id);
	}

	/**
	 * Resolve Moonraker base URL for a printer id. Empty id selects the default
	 * configured printer. Non-empty unknown ids throw — no silent fallback.
	 *
	 * @throws \InvalidArgumentException when printer_id is unknown or Moonraker is not configured
	 */
	public function resolveMoonrakerUrlOrFail(?string $printerId = null): string
	{
		if ($printerId !== null && $printerId !== '') {
			$row = $this->getMultiPrinterById($printerId);
			if ($row === null) {
				throw new \InvalidArgumentException('unknown_printer');
			}
			if (isset($row['moonraker_url']) && is_string($row['moonraker_url']) && trim($row['moonraker_url']) !== '') {
				return $this->internalUrlResolver->resolveUrl(trim($row['moonraker_url']));
			}
			throw new \InvalidArgumentException('moonraker_url_missing');
		}

		$row = $this->getMultiPrinterById(null);
		if ($row !== null && isset($row['moonraker_url']) && is_string($row['moonraker_url']) && trim($row['moonraker_url']) !== '') {
			return $this->internalUrlResolver->resolveUrl(trim($row['moonraker_url']));
		}
		$fallback = $this->getMoonrakerInternalUrl();
		if ($fallback === '') {
			throw new \InvalidArgumentException('moonraker_not_configured');
		}

		return $fallback;
	}

	public function resolveMoonrakerUrl(?string $printerId = null): string
	{
		try {
			return $this->resolveMoonrakerUrlOrFail($printerId);
		} catch (\InvalidArgumentException) {
			return $this->getMoonrakerInternalUrl();
		}
	}

	/**
	 * @throws \InvalidArgumentException when printer_id is unknown
	 */
	public function resolveCameraUrlOrFail(?string $printerId = null): string
	{
		if ($printerId !== null && $printerId !== '') {
			$row = $this->getMultiPrinterById($printerId);
			if ($row === null) {
				throw new \InvalidArgumentException('unknown_printer');
			}
			if (isset($row['camera_url']) && is_string($row['camera_url']) && trim($row['camera_url']) !== '') {
				return trim($row['camera_url']);
			}
		} else {
			$row = $this->getMultiPrinterById(null);
			if ($row !== null && isset($row['camera_url']) && is_string($row['camera_url']) && trim($row['camera_url']) !== '') {
				return trim($row['camera_url']);
			}
		}

		return $this->getMoonrakerCameraUrl();
	}

	public function resolveCameraUrl(?string $printerId = null): string
	{
		try {
			return $this->resolveCameraUrlOrFail($printerId);
		} catch (\InvalidArgumentException) {
			return $this->getMoonrakerCameraUrl();
		}
	}

	public static function moonrakerHostFingerprint(?string $url): string
	{
		if ($url === null || trim($url) === '') {
			return '';
		}
		$parsed = parse_url(trim($url));
		if (!is_array($parsed)) {
			return '';
		}
		$host = strtolower((string) ($parsed['host'] ?? ''));
		if ($host === '') {
			return '';
		}
		$port = (int) ($parsed['port'] ?? 7125);

		return $host . ':' . $port;
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

	/** @return list<array<string, mixed>> */
	public function clientSafeMultiPrinters(): array
	{
		$out = [];
		$seen = [];
		foreach ($this->getMultiPrinters() as $row) {
			$out[] = $this->clientSafePrinterRow($row);
			$seen[(string) ($row['id'] ?? '')] = true;
		}
		foreach ($this->sessionPrinters->list() as $row) {
			$id = (string) ($row['id'] ?? '');
			if ($id === '' || isset($seen[$id])) {
				continue;
			}
			$out[] = $this->clientSafePrinterRow($row);
		}

		return $out;
	}

	/** @param array<string, mixed> $row */
	private function clientSafePrinterRow(array $row): array
	{
		return [
			'id' => (string) ($row['id'] ?? ''),
			'name' => (string) ($row['name'] ?? ''),
			'default' => !empty($row['default']),
			'moonraker_host' => self::moonrakerHostFingerprint(
				isset($row['moonraker_url']) && is_string($row['moonraker_url']) ? $row['moonraker_url'] : null,
			),
		];
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
			'multi_printers' => $this->clientSafeMultiPrinters(),
			'moonraker_configured' => $this->isMoonrakerConfigured(),
			'slicer_configured' => $this->isSlicerConfigured(),
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
