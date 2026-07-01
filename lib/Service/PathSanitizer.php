<?php

declare(strict_types=1);

namespace OCA\NcPrint\Service;

/**
 * Path normalisation for untrusted proxy paths. Verbatim copy of the nc_sim
 * sibling helper so nc_print has zero PHP coupling to nc_gcs.
 */
final class PathSanitizer
{
	public static function normalize(string $raw): string
	{
		$decoded = rawurldecode($raw);
		$decoded = str_replace('\\', '/', $decoded);
		$decoded = preg_replace('/[\x00-\x1F\x7F]\.?/u', '', $decoded) ?? '';

		$segments = explode('/', $decoded);
		$safe = [];
		foreach ($segments as $segment) {
			if ($segment === '' || $segment === '.') {
				continue;
			}
			if (preg_match('/^\.+$/', $segment) === 1) {
				array_pop($safe);
				continue;
			}
			$safe[] = $segment;
		}
		return implode('/', $safe);
	}

	public static function hasTraversalAttempt(string $raw): bool
	{
		if ($raw === '') {
			return false;
		}
		if (str_contains($raw, "\0")
			|| str_contains($raw, "\r")
			|| str_contains($raw, "\n")) {
			return true;
		}
		$decoded = rawurldecode($raw);
		if ($decoded !== $raw) {
			if (str_contains($decoded, "\0")
				|| str_contains($decoded, "\r")
				|| str_contains($decoded, "\n")) {
				return true;
			}
		}
		$decoded = str_replace('\\', '/', $decoded);
		$segments = explode('/', $decoded);
		foreach ($segments as $segment) {
			if ($segment === '..') {
				return true;
			}
		}
		return false;
	}
}
