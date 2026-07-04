<?php

declare(strict_types=1);

namespace OCA\NcPrint\Tests\Unit;

use OCA\NcPrint\Service\PrinterDiscoveryService;
use PHPUnit\Framework\TestCase;

/**
 * Candidate-building is the pure, testable core of discovery (the probe does
 * live network I/O). This mirrors the coverage that previously lived against
 * AdminController::buildDiscoveryCandidates, now that the logic moved into the
 * shared service.
 */
class PrinterDiscoveryServiceTest extends TestCase
{
	public function testExplicitHostsWinOverSweep(): void
	{
		$c = PrinterDiscoveryService::buildCandidates(
			['hosts' => '10.0.0.5, 10.0.0.6 printer.local'],
			'http://10.0.0.210:7125',
		);
		$this->assertSame(['10.0.0.5', '10.0.0.6', 'printer.local'], $c);
	}

	public function testSweepFromConfiguredIp(): void
	{
		$c = PrinterDiscoveryService::buildCandidates([], 'http://10.0.0.210:7125');
		$this->assertContains('10.0.0.1', $c);
		$this->assertContains('10.0.0.254', $c);
		$this->assertContains('mainsail.local', $c);
		// 254 sweep hosts + 4 .local names, all unique.
		$this->assertSame(count($c), count(array_unique($c)));
	}

	public function testExplicitSubnetPrefix(): void
	{
		$c = PrinterDiscoveryService::buildCandidates(['subnet' => '192.168.4.'], 'http://10.0.0.210:7125');
		$this->assertContains('192.168.4.1', $c);
		$this->assertContains('192.168.4.254', $c);
		$this->assertNotContains('10.0.0.1', $c);
	}

	public function testNonIpConfiguredHostYieldsOnlyLocalNames(): void
	{
		$c = PrinterDiscoveryService::buildCandidates([], 'http://printer.example.com:7125');
		// No IP to sweep -> just the .local fallbacks.
		$this->assertSame(['mainsail.local', 'fluidd.local', 'voron.local', 'printer.local'], $c);
	}

	public function testCandidateCap(): void
	{
		$c = PrinterDiscoveryService::buildCandidates([], 'http://10.0.0.210:7125');
		$this->assertLessThanOrEqual(260, count($c));
	}

	public function testEmptyHostsProbeReturnsEmpty(): void
	{
		$svc = new PrinterDiscoveryService();
		$this->assertSame([], $svc->probe([]));
	}
}
