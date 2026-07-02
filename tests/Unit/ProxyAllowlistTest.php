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
	}

	public function testSlicerProxyOnlyAllowsApiPrefix(): void
	{
		$src = (string) file_get_contents(__DIR__ . '/../../lib/Controller/SlicerProxyController.php');
		$this->assertStringContainsString("return str_starts_with(\$upstreamPath, 'api/');", $src);
	}

	/**
	 * G45: Part B read prefixes are on the allowlist.
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
		] as $needle) {
			$this->assertStringContainsString($needle, $src, "Missing allowlist prefix: $needle");
		}
	}

	/**
	 * G45: raw gcode passthrough is never on the proxy allowlist — all writes
	 * go through PrinterController guarded actions.
	 */
	public function testProxyNeverAllowsRawGcodeScript(): void
	{
		$src = (string) file_get_contents(__DIR__ . '/../../lib/Controller/MoonrakerProxyController.php');
		// Isolate the ALLOWED_PREFIXES array literal and assert gcode/script absent.
		$this->assertMatchesRegularExpression('/ALLOWED_PREFIXES\s*=\s*\[/', $src);
		$start = strpos($src, 'ALLOWED_PREFIXES');
		$this->assertNotFalse($start);
		$end = strpos($src, '];', $start);
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
}
