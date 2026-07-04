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

	/**
	 * Non-numeric / overflow temperatures cast to dangerous values and clamp to
	 * a real setpoint: "abc" → 0.0 (S0, unintended shutdown), "1e999" → INF →
	 * clamps to the MAX (S300, unintended full heat). setTemperature must reject
	 * non-numeric input up front with is_numeric — this documents why.
	 */
	public function testNonNumericTemperatureClampsToDangerousSetpoint(): void
	{
		// (float)'abc' = 0.0 → would send M104 S0 (heater off)
		$this->assertSame(0.0, $this->invoke('clampNozzleTemp', (float) 'abc'));
		// (float)'1e999' = INF → clamps to the max, i.e. full nozzle heat
		$this->assertSame(300.0, $this->invoke('clampNozzleTemp', (float) '1e999'));
	}

	public function testSetTemperatureRejectsNonNumeric(): void
	{
		$src = (string) file_get_contents(__DIR__ . '/../../lib/Controller/PrinterController.php');
		// setTemperature guards nozzle/bed with is_numeric before casting.
		$this->assertMatchesRegularExpression(
			'/is_numeric\(\$params\[.nozzle.\]\).*is_numeric\(\$params\[.bed.\]\)/s',
			$src,
			'setTemperature must reject non-numeric nozzle/bed values',
		);
	}

	public function testBuildFilamentExtrudeScript(): void
	{
		// Extrude: relative move, default (max) feed, wrapped M83/M82.
		$this->assertSame(
			"M83\nG1 E5.000 F600\nM82",
			$this->invoke('buildGcodeScriptForAction', 'filament_extrude', ['distance' => 5]),
		);
		// Retract: negative distance.
		$this->assertSame(
			"M83\nG1 E-1.000 F600\nM82",
			$this->invoke('buildGcodeScriptForAction', 'filament_extrude', ['distance' => -1]),
		);
	}

	public function testFilamentExtrudeClampsDistanceAndFeed(): void
	{
		// |distance| clamps to 50 mm; feed clamps to the 60..600 mm/min band.
		$this->assertSame(
			"M83\nG1 E50.000 F600\nM82",
			$this->invoke('buildGcodeScriptForAction', 'filament_extrude', ['distance' => 999]),
		);
		$this->assertSame(
			"M83\nG1 E-50.000 F60\nM82",
			$this->invoke('buildGcodeScriptForAction', 'filament_extrude', ['distance' => -999, 'feed' => 1]),
		);
	}

	public function testFilamentExtrudeRejectsBadInput(): void
	{
		// Non-numeric or ~zero distance → no script.
		$this->assertNull($this->invoke('buildGcodeScriptForAction', 'filament_extrude', ['distance' => 'abc']));
		$this->assertNull($this->invoke('buildGcodeScriptForAction', 'filament_extrude', ['distance' => 0]));
		$this->assertNull($this->invoke('buildGcodeScriptForAction', 'filament_extrude', []));
	}

	public function testFilamentExtrudeIsIdleOnly(): void
	{
		$src = (string) file_get_contents(__DIR__ . '/../../lib/Controller/PrinterController.php');
		// filament_extrude must be in both the allowlist and the idle-only set.
		$this->assertMatchesRegularExpression('/ALLOWED_GCODE_ACTIONS.*filament_extrude/s', $src);
		$this->assertMatchesRegularExpression('/IDLE_ONLY_ACTIONS.*filament_extrude/s', $src);
	}
}
