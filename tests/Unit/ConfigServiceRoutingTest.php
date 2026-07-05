<?php

declare(strict_types=1);

namespace OCA\NcPrint\Tests\Unit;

use OCA\NcPrint\Service\ConfigService;
use OCA\NcPrint\Service\InternalUrlResolver;
use OCA\NcPrint\Service\SessionPrinterService;
use OCP\IConfig;
use PHPUnit\Framework\TestCase;

class ConfigServiceRoutingTest extends TestCase
{
	private function makeService(
		IConfig $config,
		?InternalUrlResolver $resolver = null,
		?SessionPrinterService $session = null,
	): ConfigService {
		return new ConfigService(
			$config,
			$resolver ?? $this->createMock(InternalUrlResolver::class),
			$session ?? $this->createMock(SessionPrinterService::class),
		);
	}

	public function testIsMoonrakerConfiguredTrueWhenMultiPrintersJsonPresent(): void
	{
		$config = $this->createMock(IConfig::class);
		$config->method('getAppValue')->willReturnCallback(
			static function (string $app, string $key, string $default = '') {
				if ($key === ConfigService::KEY_MOONRAKER_INTERNAL_URL) {
					return '';
				}
				if ($key === ConfigService::KEY_MULTI_PRINTERS) {
					return json_encode([['id' => 'k1', 'moonraker_url' => 'http://10.0.0.5:7125']], JSON_THROW_ON_ERROR);
				}
				return $default;
			},
		);

		$this->assertTrue($this->makeService($config)->isMoonrakerConfigured());
	}

	public function testResolveMoonrakerUrlOrFailThrowsOnUnknownPrinterId(): void
	{
		$config = $this->createMock(IConfig::class);
		$config->method('getAppValue')->willReturn('');

		$session = $this->createMock(SessionPrinterService::class);
		$session->method('getById')->with('found:bad')->willReturn(null);

		$service = $this->makeService($config, null, $session);

		$this->expectException(\InvalidArgumentException::class);
		$this->expectExceptionMessage('unknown_printer');
		$service->resolveMoonrakerUrlOrFail('found:bad');
	}

	public function testResolveMoonrakerUrlOrFailUsesSessionPrinter(): void
	{
		$config = $this->createMock(IConfig::class);
		$config->method('getAppValue')->willReturn('');

		$resolver = $this->createMock(InternalUrlResolver::class);
		$resolver->method('resolveUrl')->with('http://10.0.0.9:7125')->willReturn('http://resolved:7125');

		$session = $this->createMock(SessionPrinterService::class);
		$session->method('getById')->with('found:9')->willReturn([
			'id' => 'found:9',
			'moonraker_url' => 'http://10.0.0.9:7125',
		]);

		$url = $this->makeService($config, $resolver, $session)->resolveMoonrakerUrlOrFail('found:9');
		$this->assertSame('http://resolved:7125', $url);
	}

	public function testIsSlicerConfiguredTrueWithDefaultSidecar(): void
	{
		$config = $this->createMock(IConfig::class);
		$config->method('getAppValue')->willReturnCallback(
			static function (string $app, string $key, string $default = '') {
				if ($key === ConfigService::KEY_SLICER_INTERNAL_URL) {
					return '';
				}
				if ($key === ConfigService::KEY_SLICER_ENABLED) {
					return 'yes';
				}
				return $default;
			},
		);

		$this->assertTrue($this->makeService($config)->isSlicerConfigured());
	}

	public function testIsMoonrakerConfiguredTrueWhenSessionPrinterRegistered(): void
	{
		$config = $this->createMock(IConfig::class);
		$config->method('getAppValue')->willReturn('');

		$session = $this->createMock(SessionPrinterService::class);
		$session->method('list')->willReturn([
			['id' => 'found:k1', 'moonraker_url' => 'http://10.0.0.5:7125'],
		]);

		$this->assertTrue($this->makeService($config, null, $session)->isMoonrakerConfigured());
	}

	public function testResolveMoonrakerProbeUrlUsesSessionPrinter(): void
	{
		$config = $this->createMock(IConfig::class);
		$config->method('getAppValue')->willReturn('');

		$resolver = $this->createMock(InternalUrlResolver::class);
		$resolver->method('resolveUrl')->with('http://10.0.0.9:7125')->willReturn('http://resolved:7125');

		$session = $this->createMock(SessionPrinterService::class);
		$session->method('list')->willReturn([
			['id' => 'found:9', 'moonraker_url' => 'http://10.0.0.9:7125'],
		]);

		$url = $this->makeService($config, $resolver, $session)->resolveMoonrakerProbeUrl();
		$this->assertSame('http://resolved:7125', $url);
	}
}
