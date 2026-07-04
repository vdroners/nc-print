<?php

declare(strict_types=1);

namespace OCA\NcPrint\Tests\Unit;

use OCA\NcPrint\Controller\SlicerProxyController;
use OCA\NcPrint\Service\AccessService;
use OCA\NcPrint\Service\ConfigService;
use OCP\IRequest;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;
use ReflectionMethod;

/**
 * Unit-tests the pure routing/allowlist logic of the slicer proxy without
 * bootstrapping Nextcloud HTTP.
 */
class SlicerProxyControllerTest extends TestCase
{
	private function controller(): SlicerProxyController
	{
		return new SlicerProxyController(
			$this->createMock(IRequest::class),
			$this->getMockBuilder(ConfigService::class)->disableOriginalConstructor()->getMock(),
			$this->getMockBuilder(AccessService::class)->disableOriginalConstructor()->getMock(),
			$this->createMock(LoggerInterface::class),
		);
	}

	private function invoke(string $method, mixed ...$args): mixed
	{
		$ref = new ReflectionMethod(SlicerProxyController::class, $method);
		$ref->setAccessible(true);
		return $ref->invoke($this->controller(), ...$args);
	}

	public function testResolveUpstreamPathMapsSliceStream(): void
	{
		// The browser posts to `slice/stream`; it must map to the engine's
		// `api/slice/stream` (SSE) upstream path.
		$this->assertSame('api/slice/stream', $this->invoke('resolveUpstreamPath', 'slice/stream'));
		$this->assertSame('api/slice/stream', $this->invoke('resolveUpstreamPath', 'x/slice/stream'));
	}

	public function testResolveUpstreamPathPrefixesApi(): void
	{
		// Already-api paths pass through; bare paths get an api/ prefix.
		$this->assertSame('api/profiles', $this->invoke('resolveUpstreamPath', 'api/profiles'));
		$this->assertSame('api/profiles', $this->invoke('resolveUpstreamPath', 'profiles'));
		$this->assertSame('api/jobs/abc/gcode', $this->invoke('resolveUpstreamPath', 'jobs/abc/gcode'));
		$this->assertSame('', $this->invoke('resolveUpstreamPath', ''));
	}

	public function testAllowlistAcceptsUsedEndpoints(): void
	{
		foreach ([
			'api/health', 'api/version', 'api/profiles', 'api/printers',
			'api/slice', 'api/slice/stream', 'api/jobs/abc/gcode',
			'api/jobs/abc/toolpath', 'api/mesh/analyze',
			'api/calibration', 'api/calibration/list',
		] as $path) {
			$this->assertTrue($this->invoke('isAllowedSlicerPath', $path), "should allow $path");
		}
	}

	public function testAllowlistRejectsUnrelatedRoutes(): void
	{
		foreach ([
			'api/admin/reset', 'api/', 'api/system', 'api/debug',
			'apix/slice', 'admin/settings', 'etc/passwd', 'server/info',
		] as $path) {
			$this->assertFalse($this->invoke('isAllowedSlicerPath', $path), "should reject $path");
		}
	}

	public function testSanitizeQueryStringDropsRouteKeysAndReencodes(): void
	{
		// _route/_url are Nextcloud internals and must be stripped; the rest is
		// RFC3986-re-encoded so it can't be used to smuggle a second path/query.
		$out = $this->invoke('sanitizeQueryString', 'kind=printer&_route=nc_print.slicer.proxy&_url=/x');
		$this->assertStringContainsString('kind=printer', $out);
		$this->assertStringNotContainsString('_route', $out);
		$this->assertStringNotContainsString('_url', $out);

		$this->assertSame('', $this->invoke('sanitizeQueryString', ''));
		$this->assertSame('', $this->invoke('sanitizeQueryString', '_route=x&_url=y'));
	}
}
