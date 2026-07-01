<?php

declare(strict_types=1);

namespace OCA\NcPrint\Tests\Unit;

use PHPUnit\Framework\TestCase;

/**
 * Allowlist regression tests without bootstrapping Nextcloud (OCP).
 */
class ProxyAllowlistTest extends TestCase
{
	public function testMoonrakerAllowlistPrefixesInController(): void
	{
		$src = (string) file_get_contents(__DIR__ . '/../../lib/Controller/MoonrakerProxyController.php');
		foreach ([
			"'server/info'",
			"'server/files/'",
			"'printer/objects/'",
			"'printer/print/'",
		] as $needle) {
			$this->assertStringContainsString($needle, $src);
		}
	}

	public function testSlicerProxyOnlyAllowsApiPrefix(): void
	{
		$src = (string) file_get_contents(__DIR__ . '/../../lib/Controller/SlicerProxyController.php');
		$this->assertStringContainsString("return str_starts_with(\$upstreamPath, 'api/');", $src);
	}
}
