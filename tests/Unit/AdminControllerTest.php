<?php

declare(strict_types=1);

namespace OCA\NcPrint\Tests\Unit;

use OCA\NcPrint\Controller\AdminController;
use PHPUnit\Framework\TestCase;

/**
 * Tests the pure discovery-candidate derivation (no network / OCP).
 */
class AdminControllerTest extends TestCase
{
	public function testExplicitHostsListWins(): void
	{
		$c = AdminController::buildDiscoveryCandidates(
			['hosts' => '10.0.0.5, printer.local  10.0.0.6:7130'],
			'http://10.0.0.210:7125',
		);
		$this->assertSame(['10.0.0.5', 'printer.local', '10.0.0.6:7130'], $c);
	}

	public function testDerivesSlash24FromConfiguredIp(): void
	{
		$c = AdminController::buildDiscoveryCandidates([], 'http://10.0.0.210:7125');
		// full /24 sweep + the .local fallbacks
		$this->assertContains('10.0.0.1', $c);
		$this->assertContains('10.0.0.254', $c);
		$this->assertNotContains('10.0.0.0', $c); // sweep starts at .1
		$this->assertContains('mainsail.local', $c);
		$this->assertContains('fluidd.local', $c);
	}

	public function testExplicitSubnetOverridesConfigured(): void
	{
		$c = AdminController::buildDiscoveryCandidates(['subnet' => '192.168.4.'], 'http://10.0.0.210:7125');
		$this->assertContains('192.168.4.1', $c);
		$this->assertContains('192.168.4.254', $c);
		$this->assertNotContains('10.0.0.5', $c);
	}

	public function testNonIpConfiguredHostFallsBackToLocalNamesOnly(): void
	{
		// A hostname (not an IP) can't seed a /24 — only the .local fallbacks.
		$c = AdminController::buildDiscoveryCandidates([], 'http://printer.example.com:7125');
		$this->assertContains('mainsail.local', $c);
		$this->assertNotContains('printer.example.com', $c);
		// no numeric sweep entries
		$this->assertEmpty(array_filter($c, static fn ($h) => preg_match('/^\d+\.\d+\.\d+\.\d+$/', $h)));
	}

	public function testCandidatesAreCapped(): void
	{
		$c = AdminController::buildDiscoveryCandidates([], 'http://10.0.0.210:7125');
		$this->assertLessThanOrEqual(260, count($c));
	}

	/**
	 * console_enabled must stay occ-only — not writable via Admin saveSettings.
	 */
	public function testSaveSettingsDoesNotWriteConsoleEnabled(): void
	{
		$src = (string) file_get_contents(__DIR__ . '/../../lib/Controller/AdminController.php');
		$start = strpos($src, 'function saveSettings');
		$this->assertNotFalse($start);
		$end = strpos($src, 'function ', $start + 10);
		$this->assertNotFalse($end);
		$block = substr($src, $start, $end - $start);
		$this->assertStringNotContainsString('KEY_CONSOLE_ENABLED', $block);
		$this->assertStringContainsString('KEY_SLICER_ENABLED', $block);
		$this->assertStringContainsString('KEY_MOONRAKER_ENABLED', $block);
	}
}
