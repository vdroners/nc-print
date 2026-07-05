<?php

declare(strict_types=1);

namespace OCA\NcPrint\Util;

/**
 * Blocks cloud-metadata and link-local targets on admin-configured outbound URLs.
 */
final class UrlSafety
{
	public static function isAllowedOutboundHost(string $host): bool
	{
		$host = strtolower(trim($host));
		if ($host === '' || $host === 'metadata.google.internal') {
			return false;
		}
		if (!filter_var($host, FILTER_VALIDATE_IP)) {
			return true;
		}
		if ($host === '127.0.0.1' || $host === '0.0.0.0' || $host === '::1') {
			return false;
		}
		// Link-local / cloud metadata (169.254.0.0/16)
		if (str_starts_with($host, '169.254.')) {
			return false;
		}

		return true;
	}

	public static function isSafeHttpUrl(string $url): bool
	{
		$parts = parse_url($url);
		if ($parts === false || !isset($parts['scheme'], $parts['host'])) {
			return false;
		}
		$scheme = strtolower((string) $parts['scheme']);
		if (!in_array($scheme, ['http', 'https'], true)) {
			return false;
		}

		return self::isAllowedOutboundHost((string) $parts['host']);
	}
}
