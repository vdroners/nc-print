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

class PrinterControllerProgressTest extends TestCase
{
	/**
	 * @param array<string, mixed> $status
	 * @return array<string, mixed>
	 */
	private function normalizeState(array $status): array
	{
		$controller = new PrinterController(
			$this->createMock(IRequest::class),
			$this->getMockBuilder(ConfigService::class)->disableOriginalConstructor()->getMock(),
			$this->getMockBuilder(AccessService::class)->disableOriginalConstructor()->getMock(),
			$this->createMock(LoggerInterface::class),
		);

		$method = new ReflectionMethod(PrinterController::class, 'normalizeState');
		$method->setAccessible(true);

		return $method->invoke($controller, $status);
	}

	public function testMissingProgressDefaultsToZero(): void
	{
		$result = $this->normalizeState([
			'print_stats' => [
				'state' => 'printing',
				'print_duration' => 842.5,
				'info' => ['print_duration' => 842.5],
			],
			'display_status' => [],
		]);

		$this->assertSame(0.0, $result['progress']);
		$this->assertSame(842.5, $result['print_duration']);
	}

	public function testFractionProgressBetweenZeroAndOne(): void
	{
		$result = $this->normalizeState([
			'print_stats' => ['state' => 'printing'],
			'display_status' => ['progress' => 0.42],
		]);

		$this->assertSame(0.42, $result['progress']);
	}

	public function testPercentProgressAboveOneIsNormalized(): void
	{
		$result = $this->normalizeState([
			'print_stats' => ['state' => 'printing'],
			'display_status' => ['progress' => 75.0],
		]);

		$this->assertSame(0.75, $result['progress']);
	}

	public function testVirtualSdcardProgressPreferredOverEmptyDisplay(): void
	{
		$result = $this->normalizeState([
			'print_stats' => [
				'state' => 'printing',
				'print_duration' => 842.5,
			],
			'display_status' => ['progress' => 0.0],
			'virtual_sdcard' => [
				'progress' => 0.42,
				'layer' => 12,
				'layer_count' => 402,
			],
		]);

		$this->assertSame(0.42, $result['progress']);
		$this->assertSame(842.5, $result['print_duration']);
		$this->assertSame(12, $result['layer']);
		$this->assertSame(402, $result['layer_count']);
	}
}
