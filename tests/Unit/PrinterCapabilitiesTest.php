<?php

declare(strict_types=1);

namespace OCA\NcPrint\Tests\Unit;

use OCA\NcPrint\Controller\PrinterController;
use PHPUnit\Framework\TestCase;

/**
 * Pure capability-normalizer coverage (the network fetch is exercised e2e).
 * Uses realistic Moonraker shapes: toolhead.axis_maximum/minimum for build
 * volume, configfile.settings for extruder count + enclosure, and
 * machine.system_info for model/OS.
 */
class PrinterCapabilitiesTest extends TestCase
{
	public function testBuildVolumeFromAxisSpan(): void
	{
		// Real Creality K1 numbers: max [306.5, 306, 305], min [-2, -2, -10].
		$status = [
			'toolhead' => [
				'axis_maximum' => [306.5, 306.0, 305.0, 0.0],
				'axis_minimum' => [-2.0, -2.0, -10.0, 0.0],
			],
		];
		$caps = PrinterController::normalizeCapabilities($status, []);
		$this->assertSame(['x' => 309, 'y' => 308, 'z' => 315], $caps['build_volume']);
		// A toolhead with no configfile still implies a single extruder.
		$this->assertSame(1, $caps['extruders']);
	}

	public function testExtruderCountFromConfigSections(): void
	{
		$status = [
			'toolhead' => ['axis_maximum' => [250, 250, 250]],
			'configfile' => ['settings' => [
				'extruder' => [], 'extruder1' => [], 'extruder2' => [],
				'stepper_x' => [], 'heater_bed' => [],
			]],
		];
		$caps = PrinterController::normalizeCapabilities($status, []);
		$this->assertSame(3, $caps['extruders']);
	}

	public function testEnclosureHeuristic(): void
	{
		$status = [
			'toolhead' => ['axis_maximum' => [250, 250, 250]],
			'configfile' => ['settings' => [
				'extruder' => [], 'temperature_sensor chamber' => [],
			]],
		];
		$caps = PrinterController::normalizeCapabilities($status, []);
		$this->assertTrue($caps['has_enclosure']);
	}

	public function testModelAndOsFromSystemInfo(): void
	{
		$status = ['toolhead' => ['axis_maximum' => [220, 220, 250]]];
		$systemInfo = [
			'cpu_info' => ['hardware_desc' => 'Raspberry Pi 4 Model B'],
			'distribution' => ['name' => 'Buildroot 2020.02.1'],
		];
		$caps = PrinterController::normalizeCapabilities($status, $systemInfo);
		$this->assertSame('Raspberry Pi 4 Model B', $caps['model']);
		$this->assertSame('Buildroot 2020.02.1', $caps['os']);
	}

	public function testEmptyInputsReturnNull(): void
	{
		$this->assertNull(PrinterController::normalizeCapabilities([], []));
		// A toolhead with no usable axis data + no config still yields at least
		// the inferred extruder, so it is NOT null.
		$partial = PrinterController::normalizeCapabilities(['toolhead' => ['position' => [0, 0, 0]]], []);
		$this->assertSame(1, $partial['extruders']);
		$this->assertArrayNotHasKey('build_volume', $partial);
	}
}
