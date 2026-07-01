<?php

declare(strict_types=1);

namespace OCA\NcPrint\Tests\Unit;

use OCA\NcPrint\Controller\PrinterController;
use OCA\NcPrint\Service\AccessService;
use OCA\NcPrint\Service\ConfigService;
use OCP\IRequest;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;
use ReflectionMethod;

class PrinterControllerClampingTest extends TestCase
{
	private function invoke(string $method, mixed ...$args): mixed
	{
		$controller = new PrinterController(
			$this->createMock(IRequest::class),
			$this->getMockBuilder(ConfigService::class)->disableOriginalConstructor()->getMock(),
			$this->getMockBuilder(AccessService::class)->disableOriginalConstructor()->getMock(),
			$this->createMock(LoggerInterface::class),
		);

		$ref = new ReflectionMethod(PrinterController::class, $method);
		$ref->setAccessible(true);

		return $ref->invoke($controller, ...$args);
	}

	public function testClampNozzleTempBounds(): void
	{
		$this->assertSame(0.0, $this->invoke('clampNozzleTemp', -10.0));
		$this->assertSame(300.0, $this->invoke('clampNozzleTemp', 350.0));
		$this->assertSame(210.0, $this->invoke('clampNozzleTemp', 210.0));
	}

	public function testClampBedTempBounds(): void
	{
		$this->assertSame(0.0, $this->invoke('clampBedTemp', -5.0));
		$this->assertSame(120.0, $this->invoke('clampBedTemp', 200.0));
		$this->assertSame(60.0, $this->invoke('clampBedTemp', 60.0));
	}

	public function testBuildTemperatureGcode(): void
	{
		$script = $this->invoke('buildGcodeScriptForAction', 'tune_speed', ['value' => 250]);
		$this->assertSame('M220 S200', $script);

		$flow = $this->invoke('buildGcodeScriptForAction', 'tune_flow', ['value' => 40]);
		$this->assertSame('M221 S50', $flow);

		$fan = $this->invoke('buildGcodeScriptForAction', 'tune_fan', ['value' => 300]);
		$this->assertSame('M106 S255', $fan);

		$babystep = $this->invoke('buildGcodeScriptForAction', 'babystep_z', ['value' => 5.0]);
		$this->assertSame('SET_GCODE_OFFSET Z_ADJUST=2.000 MOVE=1', $babystep);
	}

	public function testBuildJogGcode(): void
	{
		$script = $this->invoke('buildGcodeScriptForAction', 'jog', [
			'axis' => 'x',
			'distance' => 15,
		]);
		$this->assertSame("G91\nG0 X10.000 F3000\nG90", $script);
	}

	public function testBuildHomeGcode(): void
	{
		$this->assertSame('G28', $this->invoke('buildGcodeScriptForAction', 'home_all', []));
		$this->assertSame('G28 Z', $this->invoke('buildGcodeScriptForAction', 'home_z', []));
		$this->assertSame('M84', $this->invoke('buildGcodeScriptForAction', 'disable_steppers', []));
	}
}
