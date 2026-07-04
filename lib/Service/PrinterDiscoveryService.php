<?php

declare(strict_types=1);

namespace OCA\NcPrint\Service;

/**
 * LAN discovery of Moonraker printers.
 *
 * Extracted from AdminController so the admin settings page AND the in-app
 * printer picker share one implementation. Builds a candidate host list
 * (explicit list, or a /24 sweep around the configured Moonraker host, plus a
 * few common .local names) and probes each for a Moonraker `/server/info`
 * response in parallel.
 *
 * Candidate-building is pure/static (unit-tested directly); the probe does the
 * network I/O.
 */
class PrinterDiscoveryService
{
	private const MOONRAKER_PORT = 7125;
	private const CANDIDATE_CAP = 260;

	/**
	 * Build the candidate host list. An explicit `hosts` param wins; otherwise a
	 * /24 sweep from an explicit `subnet` or the configured Moonraker IP, plus
	 * common .local names. Deduped and capped.
	 *
	 * @param array<string, mixed> $params
	 * @return list<string>
	 */
	public static function buildCandidates(array $params, string $configuredUrl): array
	{
		$candidates = [];
		$rawHosts = trim((string) ($params['hosts'] ?? ''));
		if ($rawHosts !== '') {
			foreach (preg_split('/[\s,]+/', $rawHosts, -1, PREG_SPLIT_NO_EMPTY) ?: [] as $h) {
				$candidates[] = $h;
			}
		} else {
			$base = null;
			$parts = @parse_url($configuredUrl);
			if (is_array($parts) && !empty($parts['host']) && filter_var($parts['host'], FILTER_VALIDATE_IP)) {
				$base = $parts['host'];
			}
			$subnet = trim((string) ($params['subnet'] ?? ''));
			if ($subnet !== '' && preg_match('/^(\d+\.\d+\.\d+)\.$/', $subnet, $m)) {
				$prefix = $m[1];
			} elseif ($base !== null && preg_match('/^(\d+\.\d+\.\d+)\.\d+$/', $base, $m)) {
				$prefix = $m[1];
			} else {
				$prefix = null;
			}
			if ($prefix !== null) {
				for ($i = 1; $i <= 254; $i++) {
					$candidates[] = "$prefix.$i";
				}
			}
			foreach (['mainsail.local', 'fluidd.local', 'voron.local', 'printer.local'] as $name) {
				$candidates[] = $name;
			}
		}

		$candidates = array_values(array_unique($candidates));
		if (count($candidates) > self::CANDIDATE_CAP) {
			$candidates = array_slice($candidates, 0, self::CANDIDATE_CAP);
		}
		return $candidates;
	}

	/**
	 * Discover Moonraker printers from a candidate list derived from $params +
	 * the configured Moonraker URL.
	 *
	 * @param array<string, mixed> $params
	 * @return list<array<string, mixed>>
	 */
	public function discover(array $params, string $configuredUrl): array
	{
		return $this->probe(self::buildCandidates($params, $configuredUrl), self::MOONRAKER_PORT);
	}

	/**
	 * Probe candidate hosts for a Moonraker `/server/info` response in parallel.
	 *
	 * @param list<string> $hosts
	 * @return list<array<string, mixed>>
	 */
	public function probe(array $hosts, int $port = self::MOONRAKER_PORT): array
	{
		if ($hosts === []) {
			return [];
		}
		$mh = curl_multi_init();
		$handles = [];
		foreach ($hosts as $host) {
			// Allow host:port overrides in an explicit list.
			$h = $host;
			$p = $port;
			if (str_contains($host, ':') && filter_var($host, FILTER_VALIDATE_IP) === false) {
				[$h, $maybePort] = explode(':', $host, 2);
				if (ctype_digit($maybePort)) {
					$p = (int) $maybePort;
				}
			}
			$url = "http://$h:$p/server/info";
			$ch = curl_init($url);
			curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
			curl_setopt($ch, CURLOPT_CONNECTTIMEOUT_MS, 400);
			curl_setopt($ch, CURLOPT_TIMEOUT_MS, 900);
			curl_setopt($ch, CURLOPT_NOSIGNAL, true);
			$handles[$host] = ['ch' => $ch, 'url' => "http://$h:$p"];
			curl_multi_add_handle($mh, $ch);
		}

		$running = null;
		do {
			curl_multi_exec($mh, $running);
			if ($running > 0) {
				curl_multi_select($mh, 0.2);
			}
		} while ($running > 0);

		$found = [];
		foreach ($handles as $host => $info) {
			$ch = $info['ch'];
			$code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
			$body = curl_multi_getcontent($ch);
			if ($code === 200 && is_string($body)) {
				$json = json_decode($body, true);
				$result = $json['result'] ?? $json;
				if (is_array($result) && (isset($result['klippy_state']) || isset($result['moonraker_version']))) {
					$found[] = [
						'host' => $host,
						'moonraker_url' => $info['url'],
						'klippy_state' => (string) ($result['klippy_state'] ?? 'unknown'),
						'moonraker_version' => (string) ($result['moonraker_version'] ?? ''),
						'hostname' => (string) ($result['hostname'] ?? ''),
					];
				}
			}
			curl_multi_remove_handle($mh, $ch);
			curl_close($ch);
		}
		curl_multi_close($mh);
		return $found;
	}
}
