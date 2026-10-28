<?php

declare(strict_types=1);

namespace OCA\NcPrint\Tests\Unit;

use OCA\NcPrint\Service\PrintGuardService;
use PHPUnit\Framework\TestCase;

class PrintGuardServiceTest extends TestCase
{
	public function testTempDeviationAlert(): void
	{
		$g = new PrintGuardService();
		$out = $g->evaluate([
			'print_stats' => ['state' => 'printing', 'filename' => 'x.gcode'],
			'display_status' => ['progress' => 0.5],
			'extruder' => ['temperature' => 200.0, 'target' => 270.0],
			'heater_bed' => ['temperature' => 65.0, 'target' => 65.0],
		], null, ['temp_deviation_c' => 25]);
		$types = array_column($out['alerts'], 'type');
		$this->assertContains('temp_deviation', $types);
	}

	public function testProgressUsesVirtualSdcardAheadOfDisplayStatus(): void
	{
		$g = new PrintGuardService();
		$out = $g->evaluate([
			'print_stats' => ['state' => 'printing', 'filename' => 'cone.gcode'],
			'virtual_sdcard' => ['progress' => 0.33],
			'display_status' => ['progress' => 0.15],
			'extruder' => ['temperature' => 200.0, 'target' => 200.0],
			'heater_bed' => ['temperature' => 60.0, 'target' => 60.0],
		]);
		$this->assertEqualsWithDelta(33.0, $out['snapshot']['progress'], 0.01);
		$this->assertSame('printing', $out['snapshot']['state']);
	}

	public function testIdleNoAlerts(): void
	{
		$g = new PrintGuardService();
		$out = $g->evaluate([
			'print_stats' => ['state' => 'standby'],
			'extruder' => ['temperature' => 30.0, 'target' => 0.0],
		]);
		$this->assertSame([], $out['alerts']);
	}
}
