<?php

declare(strict_types=1);

namespace OCA\NcPrint\Tests\Unit;

use PHPUnit\Framework\TestCase;

/**
 * Allowlist regression tests without bootstrapping Nextcloud (OCP).
 */
class ProxyAllowlistTest extends TestCase
{
	public function testMoonrakerAllowlistPrefixesInController(): void
	{
		$src = (string) file_get_contents(__DIR__ . '/../../lib/Controller/MoonrakerProxyController.php');
		foreach ([
			"'server/info'",
			"'server/files/'",
			"'printer/objects/'",
			"'printer/print/'",
		] as $needle) {
			$this->assertStringContainsString($needle, $src);
		}
		$this->assertStringContainsString('ALLOWED_GET_PREFIXES', $src);
		$this->assertStringContainsString('ALLOWED_POST_PREFIXES', $src);
	}

	public function testSlicerProxyUsesExplicitPrefixAllowlist(): void
	{
		$src = (string) file_get_contents(__DIR__ . '/../../lib/Controller/SlicerProxyController.php');
		// Tightened from a blanket api/* to an explicit prefix allowlist.
		$this->assertStringContainsString('ALLOWED_SLICER_PREFIXES', $src);
		foreach ([
			"'api/health'",
			"'api/profiles'",
			"'api/profile-settings'",
			"'api/slice'",
			"'api/jobs/'",
			"'api/mesh/'",
			"'api/calibration'",
		] as $needle) {
			$this->assertStringContainsString($needle, $src, "Missing slicer allowlist prefix: $needle");
		}
		// The old blanket allow-all must be gone.
		$this->assertStringNotContainsString("return str_starts_with(\$upstreamPath, 'api/');", $src);
	}

	/**
	 * The tightened allowlist logic actually accepts the used prefixes and
	 * rejects unrelated engine routes (e.g. api/admin/*). Reproduce the
	 * matcher here to prove behaviour without bootstrapping OCP.
	 */
	public function testSlicerAllowlistAcceptsAndRejects(): void
	{
		$prefixes = [
			'api/health', 'api/version', 'api/profiles', 'api/profile-settings',
			'api/printers', 'api/slice', 'api/jobs/', 'api/mesh/', 'api/calibration',
		];
		$allowed = static function (string $p) use ($prefixes): bool {
			foreach ($prefixes as $prefix) {
				if ($p === rtrim($prefix, '/') || str_starts_with($p, $prefix)) {
					return true;
				}
			}
			return false;
		};
		foreach (['api/health', 'api/slice/stream', 'api/jobs/abc/gcode',
			'api/jobs/abc/toolpath', 'api/mesh/analyze', 'api/calibration/list',
			'api/profiles', 'api/profile-settings'] as $ok) {
			$this->assertTrue($allowed($ok), "should allow $ok");
		}
		foreach (['api/admin/reset', 'api/', 'api/system', 'api/debug',
			'apix/slice', 'admin/settings'] as $bad) {
			$this->assertFalse($allowed($bad), "should reject $bad");
		}
	}

	/**
	 * G45: Part B read prefixes are on the GET allowlist.
	 */
	public function testPartBReadPrefixesAllowed(): void
	{
		$src = (string) file_get_contents(__DIR__ . '/../../lib/Controller/MoonrakerProxyController.php');
		foreach ([
			"'server/temperature_store'",
			"'server/history/'",
			"'server/job_queue/'",
			"'machine/timelapse/'",
			"'server/timelapse'",
			"'machine/device_power/'",
			"'server/spoolman/'",
			// v1.27.0 monitor expansion (read-only).
			"'server/webcams'",
			"'machine/update/status'",
			"'server/announcements/'",
		] as $needle) {
			$this->assertStringContainsString($needle, $src, "Missing allowlist prefix: $needle");
		}
	}

	/**
	 * v1.27.0: the monitor-expansion components are feature-detected so their
	 * panels can hide when the plugin is absent.
	 */
	public function testMonitorFeatureDetection(): void
	{
		$src = (string) file_get_contents(__DIR__ . '/../../lib/Controller/ApiController.php');
		foreach (["'webcam'", "'update_manager'", "'announcements'"] as $needle) {
			$this->assertStringContainsString($needle, $src, "Missing feature detection: $needle");
		}
	}

	/**
	 * Method allowlist: POST only for job_queue + device_power; files/print writes denied.
	 */
	public function testMoonrakerMethodAllowlist(): void
	{
		$src = (string) file_get_contents(__DIR__ . '/../../lib/Controller/MoonrakerProxyController.php');
		$this->assertStringContainsString('isAllowedMoonrakerRequest', $src);

		$getPrefixes = [
			'server/info', 'server/files/', 'printer/objects/', 'printer/print/',
			'server/temperature_store', 'server/history/', 'server/job_queue/',
			'machine/timelapse/', 'server/timelapse', 'machine/device_power/',
			'server/spoolman/', 'server/webcams', 'machine/update/status',
			'machine/update_manager/status', 'server/announcements/',
		];
		$postPrefixes = ['server/job_queue/', 'machine/device_power/'];
		$allowed = static function (string $path, string $method) use ($getPrefixes, $postPrefixes): bool {
			$match = static function (string $safePath, array $prefixes): bool {
				foreach ($prefixes as $prefix) {
					if ($safePath === rtrim($prefix, '/') || str_starts_with($safePath, $prefix)) {
						return true;
					}
				}
				return false;
			};
			$method = strtoupper($method);
			if ($method === 'GET' || $method === 'HEAD') {
				return $match($path, $getPrefixes);
			}
			if ($method === 'POST') {
				return $match($path, $postPrefixes);
			}
			return false;
		};

		$this->assertTrue($allowed('server/info', 'GET'));
		$this->assertTrue($allowed('server/files/gcodes/x.gcode', 'GET'));
		$this->assertTrue($allowed('server/job_queue/status', 'GET'));
		$this->assertTrue($allowed('server/job_queue/job', 'POST'));
		$this->assertTrue($allowed('machine/device_power/device', 'POST'));
		$this->assertFalse($allowed('server/files/upload', 'POST'));
		$this->assertFalse($allowed('printer/print/start', 'POST'));
		$this->assertFalse($allowed('printer/print/pause', 'POST'));
		$this->assertFalse($allowed('server/job_queue/job', 'DELETE'));
		$this->assertFalse($allowed('machine/device_power/device', 'PUT'));
	}

	/**
	 * G45: raw gcode passthrough is never on the proxy allowlist — all writes
	 * go through PrinterController guarded actions (except queue/power POSTs).
	 */
	public function testProxyNeverAllowsRawGcodeScript(): void
	{
		$src = (string) file_get_contents(__DIR__ . '/../../lib/Controller/MoonrakerProxyController.php');
		$this->assertMatchesRegularExpression('/ALLOWED_GET_PREFIXES\s*=\s*\[/', $src);
		$this->assertMatchesRegularExpression('/ALLOWED_POST_PREFIXES\s*=\s*\[/', $src);
		$start = strpos($src, 'ALLOWED_GET_PREFIXES');
		$this->assertNotFalse($start);
		$end = strpos($src, 'private const CONNECT_TIMEOUT', $start);
		$this->assertNotFalse($end);
		$block = substr($src, $start, $end - $start);
		$this->assertStringNotContainsString('printer/gcode/script', $block);
		$this->assertStringNotContainsString('printer/gcode', $block);
	}

	/**
	 * G45: the arbitrary console send path is gated behind console_enabled and
	 * returns 403 when disabled; guards multiline / oversize / non-ASCII.
	 */
	public function testConsoleCommandIsGuarded(): void
	{
		$src = (string) file_get_contents(__DIR__ . '/../../lib/Controller/PrinterController.php');
		$this->assertStringContainsString('public function consoleCommand()', $src);
		$this->assertStringContainsString('isConsoleEnabled()', $src);
		$this->assertStringContainsString("'console_disabled'", $src);
		$this->assertStringContainsString('STATUS_FORBIDDEN', $src);
		// printable-ASCII single-line guard
		$this->assertStringContainsString('\x20-\x7E', $src);
		$this->assertStringContainsString('CONSOLE_CMD_MAX_LEN', $src);
	}

	/**
	 * G45: config default for console_enabled is OFF.
	 */
	public function testConsoleDisabledByDefault(): void
	{
		$src = (string) file_get_contents(__DIR__ . '/../../lib/Service/ConfigService.php');
		$this->assertMatchesRegularExpression(
			'/isConsoleEnabled\(\).*?KEY_CONSOLE_ENABLED,\s*\n?\s*false/s',
			$src,
		);
	}

	/**
	 * Session discovery camera_url must pass UrlSafety before register.
	 */
	public function testSessionCameraUrlIsSafetyChecked(): void
	{
		$src = (string) file_get_contents(__DIR__ . '/../../lib/Controller/SessionPrinterController.php');
		$this->assertStringContainsString('use OCA\\NcPrint\\Util\\UrlSafety', $src);
		$this->assertMatchesRegularExpression(
			'/camera_url[\\s\\S]{0,400}UrlSafety::isSafeHttpUrl\\(\\$cameraUrl\\)/',
			$src,
		);
	}
}
