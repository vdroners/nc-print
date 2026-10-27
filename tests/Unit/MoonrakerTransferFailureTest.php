<?php

declare(strict_types=1);

namespace OCA\NcPrint\Tests\Unit;

use OCA\NcPrint\Controller\PrinterController;
use OCA\NcPrint\Service\AccessService;
use OCA\NcPrint\Service\ConfigService;
use OCA\NcPrint\Service\MoonrakerTransferFailure;
use OCP\AppFramework\Http;
use OCP\IRequest;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;
use ReflectionClass;
use ReflectionMethod;

class MoonrakerTransferFailureTest extends TestCase
{
	public function testOperationTimeoutIsTimeoutAndHidesTheCurlString(): void
	{
		$raw = 'Operation timed out after 60000 milliseconds with 120000 bytes received from 10.0.0.210';
		$result = MoonrakerTransferFailure::classify(28, $raw, 0);

		$this->assertSame('timeout', $result['failure']);
		$this->assertSame('moonraker_timeout', $result['error']);
		$this->assertTrue($result['retryable']);
		$this->assertSame(MoonrakerTransferFailure::TIMEOUT_MESSAGE, $result['message']);
		$this->assertStringNotContainsString('10.0.0.210', $result['message']);
		$this->assertStringNotContainsString('120000', $result['message']);
	}

	public function testConnectTimeoutIsUnreachable(): void
	{
		$result = MoonrakerTransferFailure::classify(28, 'Connection timed out after 5001 milliseconds', 0);

		$this->assertSame('unreachable', $result['failure']);
		$this->assertSame('moonraker_unreachable', $result['error']);
		$this->assertTrue($result['retryable']);
	}

	public function testConnectionResetAndRefusedAreUnreachable(): void
	{
		$reset = MoonrakerTransferFailure::classify(56, 'Recv failure: Connection reset by peer', 0);
		$send = MoonrakerTransferFailure::classify(55, 'Send failure: Connection reset by peer', 0);
		$refused = MoonrakerTransferFailure::classify(7, 'Failed to connect to 10.0.0.210 port 7125: Connection refused', 0);
		$resolve = MoonrakerTransferFailure::classify(6, 'Could not resolve host: printer.local', 0);

		$this->assertSame('unreachable', $reset['failure']);
		$this->assertSame('unreachable', $send['failure']);
		$this->assertSame('unreachable', $refused['failure']);
		$this->assertSame('unreachable', $resolve['failure']);
		$this->assertStringNotContainsString('10.0.0.210', $refused['message']);
		$this->assertStringNotContainsString('printer.local', $resolve['message']);
	}

	public function testGatewayStatusesAreUnreachableAndHttp504IsTimeout(): void
	{
		$this->assertSame('unreachable', MoonrakerTransferFailure::classify(0, '', 502)['failure']);
		$this->assertSame('unreachable', MoonrakerTransferFailure::classify(0, '', 503)['failure']);
		$this->assertSame('timeout', MoonrakerTransferFailure::classify(0, '', 504)['failure']);
		$this->assertSame('timeout', MoonrakerTransferFailure::classify(0, '', 408)['failure']);
	}

	public function testPrinterHttpErrorIsOtherAndKeepsTheStatus(): void
	{
		$result = MoonrakerTransferFailure::classify(0, '', 500);

		$this->assertSame('other', $result['failure']);
		$this->assertSame('moonraker_upload_failed', $result['error']);
		$this->assertTrue($result['retryable']);
		$this->assertStringContainsString('HTTP 500', $result['message']);
		$this->assertStringNotContainsString('second job', $result['message']);
	}

	public function testNoResponseAtAllIsUnreachable(): void
	{
		$result = MoonrakerTransferFailure::classify(0, '', 0);

		$this->assertSame('unreachable', $result['failure']);
		$this->assertSame(MoonrakerTransferFailure::UNREACHABLE_MESSAGE, $result['message']);
	}

	public function testUploadResponseUsesTheClassifierAndWarnsWhenStartWasRequested(): void
	{
		$controller = $this->controller();
		$this->setTransport($controller, [
			'errno' => 28,
			'error' => 'Operation timed out after 60000 milliseconds with 10 bytes received',
			'http' => 0,
		]);

		$started = $this->invokeFailure($controller, true);
		$this->assertSame(Http::STATUS_BAD_GATEWAY, $started->getStatus());
		$startedData = $started->getData();
		$this->assertSame('moonraker_timeout', $startedData['error']);
		$this->assertSame('timeout', $startedData['failure']);
		$this->assertTrue($startedData['retryable']);
		$this->assertStringContainsString('second job', $startedData['message']);

		$uploadOnly = $this->invokeFailure($controller, false);
		$this->assertStringNotContainsString('second job', $uploadOnly->getData()['message']);
	}

	private function controller(): PrinterController
	{
		return new PrinterController(
			$this->createMock(IRequest::class),
			$this->getMockBuilder(ConfigService::class)->disableOriginalConstructor()->getMock(),
			$this->getMockBuilder(AccessService::class)->disableOriginalConstructor()->getMock(),
			$this->createMock(LoggerInterface::class),
		);
	}

	/** @param array{errno:int,error:string,http:int} $transport */
	private function setTransport(PrinterController $controller, array $transport): void
	{
		$prop = (new ReflectionClass(PrinterController::class))->getProperty('lastMoonrakerTransportFailure');
		$prop->setAccessible(true);
		$prop->setValue($controller, $transport);
	}

	private function invokeFailure(PrinterController $controller, bool $start): \OCP\AppFramework\Http\JSONResponse
	{
		$method = new ReflectionMethod(PrinterController::class, 'uploadTransportFailureResponse');
		$method->setAccessible(true);

		return $method->invoke($controller, $start);
	}
}
