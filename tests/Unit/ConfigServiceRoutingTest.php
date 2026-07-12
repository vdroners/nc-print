<?php

declare(strict_types=1);

namespace OCA\NcPrint\Tests\Unit;

use OCA\NcPrint\Service\ConfigService;
use OCA\NcPrint\Service\InternalUrlResolver;
use OCA\NcPrint\Service\SessionPrinterService;
use OCP\Http\Client\IClient;
use OCP\Http\Client\IClientService;
use OCP\Http\Client\IResponse;
use OCP\IConfig;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class ConfigServiceRoutingTest extends TestCase
{
	private function makeService(
		IConfig $config,
		?InternalUrlResolver $resolver = null,
		?SessionPrinterService $session = null,
		?IClientService $clientService = null,
	): ConfigService {
		return new ConfigService(
			$config,
			$resolver ?? $this->createMock(InternalUrlResolver::class),
			$session ?? $this->createMock(SessionPrinterService::class),
			$clientService ?? $this->createMock(IClientService::class),
			$this->createMock(LoggerInterface::class),
		);
	}

	/** Build an IClientService whose GET returns the given JSON body. */
	private function clientReturning(string $body): IClientService
	{
		$response = $this->createMock(IResponse::class);
		$response->method('getBody')->willReturn($body);
		$client = $this->createMock(IClient::class);
		$client->method('get')->willReturn($response);
		$svc = $this->createMock(IClientService::class);
		$svc->method('newClient')->willReturn($client);
		return $svc;
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

	public function testGetDiscoverySubnetFromAppConfig(): void
	{
		$config = $this->createMock(IConfig::class);
		$config->method('getAppValue')->willReturnCallback(
			static function (string $app, string $key, string $default = '') {
				if ($key === ConfigService::KEY_DISCOVERY_SUBNET) {
					return '10.0.0.';
				}
				return $default;
			},
		);

		$this->assertSame('10.0.0.', $this->makeService($config)->getDiscoverySubnet());
	}

	public function testApplyDiscoveryDefaultsInjectsSubnet(): void
	{
		$config = $this->createMock(IConfig::class);
		$config->method('getAppValue')->willReturnCallback(
			static function (string $app, string $key, string $default = '') {
				if ($key === ConfigService::KEY_DISCOVERY_SUBNET) {
					return '192.168.1.';
				}
				return $default;
			},
		);

		$params = $this->makeService($config)->applyDiscoveryDefaults([]);
		$this->assertSame('192.168.1.', $params['subnet']);
	}

	public function testApplyDiscoveryDefaultsPreservesExplicitHosts(): void
	{
		$config = $this->createMock(IConfig::class);
		$config->method('getAppValue')->willReturn('10.0.0.');

		$params = $this->makeService($config)->applyDiscoveryDefaults(['hosts' => '10.0.0.210']);
		$this->assertSame('10.0.0.210', $params['hosts']);
		$this->assertArrayNotHasKey('subnet', $params);
	}

	public function testResolveCameraUrlPrefersConfiguredValue(): void
	{
		$config = $this->createMock(IConfig::class);
		$config->method('getAppValue')->willReturnCallback(
			static function (string $app, string $key, string $default = '') {
				if ($key === ConfigService::KEY_MOONRAKER_CAMERA_URL) {
					return 'http://10.0.0.210:8080/?action=snapshot';
				}
				return $default;
			},
		);
		// A client that would blow up if discovery were attempted.
		$client = $this->createMock(IClient::class);
		$client->expects($this->never())->method('get');
		$svc = $this->createMock(IClientService::class);
		$svc->method('newClient')->willReturn($client);

		$url = $this->makeService($config, null, null, $svc)->resolveCameraUrl(null);
		$this->assertSame('http://10.0.0.210:8080/?action=snapshot', $url);
	}

	public function testResolveCameraUrlAutoDiscoversSnapshotWhenUnset(): void
	{
		$config = $this->createMock(IConfig::class);
		$config->method('getAppValue')->willReturnCallback(
			static function (string $app, string $key, string $default = '') {
				if ($key === ConfigService::KEY_MOONRAKER_INTERNAL_URL) {
					return 'http://10.0.0.210:7125';
				}
				return $default; // camera url + discovered cache both empty
			},
		);
		// Discovery caches the resolved URL.
		$config->expects($this->once())
			->method('setAppValue')
			->with(
				$this->anything(),
				ConfigService::KEY_MOONRAKER_CAMERA_URL_DISCOVERED,
				'http://10.0.0.210:8080/?action=snapshot',
			);

		$resolver = $this->createMock(InternalUrlResolver::class);
		$resolver->method('resolveUrl')->willReturnArgument(0);

		$body = json_encode(['result' => ['webcams' => [[
			'enabled' => true,
			'stream_url' => 'http://10.0.0.210:8080/?action=stream',
			'snapshot_url' => 'http://10.0.0.210:8080/?action=snapshot',
		]]]], JSON_THROW_ON_ERROR);

		$url = $this->makeService($config, $resolver, null, $this->clientReturning($body))
			->resolveCameraUrl(null);
		$this->assertSame('http://10.0.0.210:8080/?action=snapshot', $url);
	}

	public function testResolveCameraUrlUsesCachedDiscovery(): void
	{
		$config = $this->createMock(IConfig::class);
		$config->method('getAppValue')->willReturnCallback(
			static function (string $app, string $key, string $default = '') {
				if ($key === ConfigService::KEY_MOONRAKER_CAMERA_URL_DISCOVERED) {
					return 'http://10.0.0.210:8080/?action=snapshot';
				}
				return $default;
			},
		);
		// Cache hit means no HTTP and no re-cache.
		$config->expects($this->never())->method('setAppValue');
		$client = $this->createMock(IClient::class);
		$client->expects($this->never())->method('get');
		$svc = $this->createMock(IClientService::class);
		$svc->method('newClient')->willReturn($client);

		$url = $this->makeService($config, null, null, $svc)->resolveCameraUrl(null);
		$this->assertSame('http://10.0.0.210:8080/?action=snapshot', $url);
	}

	public function testResolveCameraUrlReturnsEmptyWhenNoWebcamAndNoConfig(): void
	{
		$config = $this->createMock(IConfig::class);
		$config->method('getAppValue')->willReturnCallback(
			static function (string $app, string $key, string $default = '') {
				if ($key === ConfigService::KEY_MOONRAKER_INTERNAL_URL) {
					return 'http://10.0.0.210:7125';
				}
				return $default;
			},
		);
		$resolver = $this->createMock(InternalUrlResolver::class);
		$resolver->method('resolveUrl')->willReturnArgument(0);

		$body = json_encode(['result' => ['webcams' => []]], JSON_THROW_ON_ERROR);
		$url = $this->makeService($config, $resolver, null, $this->clientReturning($body))
			->resolveCameraUrl(null);
		$this->assertSame('', $url);
	}
}
