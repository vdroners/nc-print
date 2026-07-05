<?php

declare(strict_types=1);

namespace OCA\NcPrint\Service;

use OCP\ISession;

/**
 * Per-user session registry for discovered printers (found:* ids).
 * URLs stay server-side; the client only sends printer_id on API calls.
 */
class SessionPrinterService
{
	public const SESSION_KEY = 'nc_print_session_printers';

	public function __construct(
		private ISession $session,
	) {
	}

	/** @return list<array<string, mixed>> */
	public function list(): array
	{
		$raw = $this->session->get(self::SESSION_KEY);
		if (!is_array($raw)) {
			return [];
		}
		$out = [];
		foreach ($raw as $row) {
			if (is_array($row) && isset($row['id']) && is_string($row['id']) && $row['id'] !== '') {
				$out[] = $row;
			}
		}
		return $out;
	}

	/**
	 * @param array<string, mixed> $row
	 * @return array<string, mixed>
	 */
	public function register(array $row): array
	{
		$id = trim((string) ($row['id'] ?? ''));
		$url = trim((string) ($row['moonraker_url'] ?? ''));
		if ($id === '' || $url === '') {
			throw new \InvalidArgumentException('id_and_moonraker_url_required');
		}
		$entry = [
			'id' => $id,
			'name' => trim((string) ($row['name'] ?? $id)),
			'moonraker_url' => $url,
			'camera_url' => trim((string) ($row['camera_url'] ?? '')),
			'default' => false,
			'_session' => true,
		];
		$rows = $this->list();
		$next = [];
		$replaced = false;
		foreach ($rows as $existing) {
			if (($existing['id'] ?? '') === $id) {
				$next[] = $entry;
				$replaced = true;
			} else {
				$next[] = $existing;
			}
		}
		if (!$replaced) {
			$next[] = $entry;
		}
		$this->session->set(self::SESSION_KEY, $next);
		return $entry;
	}

	/** @return array<string, mixed>|null */
	public function getById(string $id): ?array
	{
		foreach ($this->list() as $row) {
			if (($row['id'] ?? '') === $id) {
				return $row;
			}
		}
		return null;
	}
}
