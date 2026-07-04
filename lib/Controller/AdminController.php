<?php

declare(strict_types=1);

namespace OCA\NcPrint\Controller;

use OCA\NcPrint\AppInfo\Application;
use OCA\NcPrint\Service\ConfigService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\AdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IConfig;
use OCP\IRequest;

class AdminController extends Controller
{
	public function __construct(
		IRequest $request,
		private IConfig $config,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	#[AdminRequired]
	#[NoCSRFRequired]
	public function saveSettings(): JSONResponse
	{
		$params = $this->request->getParams();

		$stringKeys = [
			ConfigService::KEY_SLICER_INTERNAL_URL,
			ConfigService::KEY_MOONRAKER_INTERNAL_URL,
			ConfigService::KEY_MOONRAKER_CAMERA_URL,
			ConfigService::KEY_PRINTER_DISPLAY_NAME,
			ConfigService::KEY_ALLOWED_GROUPS,
			ConfigService::KEY_MULTI_PRINTERS,
		];
		foreach ($stringKeys as $key) {
			if (array_key_exists($key, $params)) {
				$this->config->setAppValue(
					Application::APP_ID,
					$key,
					trim((string) $params[$key]),
				);
			}
		}

		foreach ([ConfigService::KEY_SLICER_ENABLED, ConfigService::KEY_MOONRAKER_ENABLED] as $boolKey) {
			if (array_key_exists($boolKey, $params)) {
				$raw = $params[$boolKey];
				$enabled = ($raw === true || $raw === 1 || $raw === '1'
					|| (is_string($raw) && in_array(strtolower($raw), ['true', 'yes', 'on'], true)));
				$this->config->setAppValue(
					Application::APP_ID,
					$boolKey,
					$enabled ? 'yes' : 'no',
				);
			}
		}

		return new JSONResponse(['ok' => true]);
	}

	/**
	 * Discover Moonraker printers on the LAN by probing candidate hosts for
	 * `/server/info`. Candidates come from the /24 around the currently
	 * configured Moonraker host (or an admin-supplied `subnet`/`hosts`), plus a
	 * few common names. Admin-only; the scan runs server-side from cloud_app.
	 */
	#[AdminRequired]
	#[NoCSRFRequired]
	public function discoverPrinters(): JSONResponse
	{
		$params = $this->request->getParams();
		$configured = (string) $this->config->getAppValue(
			Application::APP_ID,
			ConfigService::KEY_MOONRAKER_INTERNAL_URL,
			ConfigService::DEFAULT_MOONRAKER_INTERNAL_URL,
		);
		$candidates = self::buildDiscoveryCandidates($params, $configured);
		$found = $this->probeMoonraker($candidates, 7125);
		return new JSONResponse(['ok' => true, 'printers' => $found]);
	}

	/**
	 * Pure candidate-host list for discovery. An explicit `hosts` list wins;
	 * otherwise a /24 sweep derived from an admin `subnet` or the configured
	 * Moonraker IP, plus common .local names. Deduped and capped at 260.
	 * @param array<string, mixed> $params
	 * @return list<string>
	 */
	public static function buildDiscoveryCandidates(array $params, string $configuredUrl): array
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
		// Cap the sweep so a pathological input can't hang the request.
		if (count($candidates) > 260) {
			$candidates = array_slice($candidates, 0, 260);
		}
		return $candidates;
	}

	/**
	 * Probe candidate hosts for a Moonraker `/server/info` response in parallel.
	 * @param list<string> $hosts
	 * @param int $port
	 * @return list<array<string, mixed>>
	 */
	private function probeMoonraker(array $hosts, int $port): array
	{
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
				// Moonraker /server/info returns klippy_state + moonraker_version.
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
