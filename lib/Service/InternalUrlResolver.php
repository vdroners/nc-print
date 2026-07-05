<?php

declare(strict_types=1);

namespace OCA\NcPrint\Service;

/**
 * Rewrites service URLs so PHP inside cloud_app can reach host-bound daemons.
 */
class InternalUrlResolver
{
	public function resolveUrl(string $url): string
	{
		$url = trim($url);
		if ($url === '') {
			return $url;
		}

		if (!$this->runningInDocker()) {
			return $url;
		}

		$parts = @parse_url($url);
		if (!is_array($parts) || empty($parts['host'])) {
			return $url;
		}

		$host = strtolower($parts['host']);
		if (in_array($host, ['127.0.0.1', 'localhost', '::1'], true)) {
			$parts['host'] = 'host.docker.internal';
			$url = $this->buildUrl($parts);
			$host = 'host.docker.internal';
		}

		if ($host === 'host.docker.internal') {
			return $this->resolveHostDockerInternal($url, $parts);
		}

		return $url;
	}


	/**
	 * Host LAN IP for services published on allowed firewall ports (Docker cannot reach :8766).
	 */
	private function dockerLanHost(): string
	{
		$fromEnv = getenv('NC_PRINT_HOST_LAN');
		if (is_string($fromEnv) && $fromEnv !== '' && filter_var($fromEnv, FILTER_VALIDATE_IP)) {
			return $fromEnv;
		}
		$gateway = $this->detectBridgeGateway();
		return $gateway ?? 'host.docker.internal';
	}

	private function dockerSlicerRelayPort(): int
	{
		$raw = getenv('NC_PRINT_DOCKER_SLICER_PORT');
		if (is_string($raw) && $raw !== '' && ctype_digit($raw)) {
			return max(1, min(65535, (int) $raw));
		}
		return 8082;
	}

	/** Rewrite slicer URL for cloud_app (8766 blocked from containers on this host). */
	public function resolveSlicerUrl(string $url): string
	{
		$url = $this->resolveUrl($url);
		if (!$this->runningInDocker()) {
			return $url;
		}
		$parts = @parse_url($url);
		if (!is_array($parts)) {
			return $url;
		}
		$port = isset($parts['port']) ? (int) $parts['port'] : 80;
		if ($port !== 8766) {
			return $url;
		}
		$parts['host'] = $this->dockerLanHost();
		$parts['port'] = $this->dockerSlicerRelayPort();
		return $this->buildUrl($parts);
	}

	private function runningInDocker(): bool
	{
		return file_exists('/.dockerenv');
	}

	/**
	 * @param array<string, mixed> $parts
	 */
	private function resolveHostDockerInternal(string $url, array $parts): string
	{
		static $cache = [];
		if (isset($cache[$url])) {
			return $cache[$url];
		}

		$host = (string) ($parts['host'] ?? '');
		$resolved = gethostbyname($host);
		if ($resolved && $resolved !== $host && filter_var($resolved, FILTER_VALIDATE_IP)) {
			return $cache[$url] = $url;
		}

		$gateway = $this->detectBridgeGateway();
		if (!$gateway) {
			return $cache[$url] = $url;
		}

		$parts['host'] = $gateway;
		return $cache[$url] = $this->buildUrl($parts);
	}

	private function detectBridgeGateway(): ?string
	{
		$fromEnv = getenv('NC_PRINT_HOST_GATEWAY');
		if (is_string($fromEnv) && $fromEnv !== '' && filter_var($fromEnv, FILTER_VALIDATE_IP)) {
			return $fromEnv;
		}

		$path = '/proc/net/route';
		if (!is_readable($path)) {
			return null;
		}
		$lines = @file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
		if (!is_array($lines)) {
			return null;
		}
		foreach ($lines as $idx => $line) {
			if ($idx === 0) {
				continue;
			}
			$fields = preg_split('/\s+/', $line);
			if (!is_array($fields) || count($fields) < 4) {
				continue;
			}
			$dest = $fields[1] ?? '';
			$gw = $fields[2] ?? '';
			if ($dest !== '00000000' || strlen($gw) !== 8) {
				continue;
			}
			$bytes = [
				hexdec(substr($gw, 6, 2)),
				hexdec(substr($gw, 4, 2)),
				hexdec(substr($gw, 2, 2)),
				hexdec(substr($gw, 0, 2)),
			];
			$ip = implode('.', $bytes);
			if (filter_var($ip, FILTER_VALIDATE_IP)) {
				return $ip;
			}
		}

		return null;
	}

	/**
	 * @param array<string, mixed> $parts
	 */
	private function buildUrl(array $parts): string
	{
		$scheme = $parts['scheme'] ?? 'http';
		$host = $parts['host'] ?? '';
		$port = isset($parts['port']) ? ':' . (int) $parts['port'] : '';
		$path = $parts['path'] ?? '';
		$query = isset($parts['query']) ? '?' . $parts['query'] : '';

		return $scheme . '://' . $host . $port . $path . $query;
	}
}
