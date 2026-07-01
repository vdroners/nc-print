<?php

declare(strict_types=1);

namespace OCA\NcPrint\Tests\Unit;

use OCA\NcPrint\Service\InternalUrlResolver;
use PHPUnit\Framework\TestCase;

class InternalUrlResolverTest extends TestCase
{
	public function testResolveUrlPassthroughOutsideDocker(): void
	{
		$resolver = new InternalUrlResolver();
		$url = 'http://10.0.0.210:7125/server/info';
		if (file_exists('/.dockerenv')) {
			$this->markTestSkipped('Docker environment rewrites URLs');
		}
		$this->assertSame($url, $resolver->resolveUrl($url));
	}

	public function testResolveSlicerUrlPreservesNon8766Port(): void
	{
		$resolver = new InternalUrlResolver();
		$url = 'http://127.0.0.1:9999/api/health';
		if (file_exists('/.dockerenv')) {
			$this->markTestSkipped('Docker environment rewrites URLs');
		}
		$this->assertSame($url, $resolver->resolveSlicerUrl($url));
	}
}
