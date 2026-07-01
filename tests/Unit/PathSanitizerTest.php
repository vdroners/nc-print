<?php

declare(strict_types=1);

namespace OCA\NcPrint\Tests\Unit;

use OCA\NcPrint\Service\PathSanitizer;
use PHPUnit\Framework\TestCase;

class PathSanitizerTest extends TestCase
{
	/** @dataProvider benignProvider */
	public function testBenignPaths(string $raw, string $expected): void
	{
		$this->assertSame($expected, PathSanitizer::normalize($raw));
		$this->assertFalse(PathSanitizer::hasTraversalAttempt($raw));
	}

	public static function benignProvider(): array
	{
		return [
			['api/health', 'api/health'],
			['/api/profiles', 'api/profiles'],
			['api//slice/stream', 'api/slice/stream'],
		];
	}

	/** @dataProvider traversalProvider */
	public function testTraversalBlocked(string $raw): void
	{
		$this->assertTrue(PathSanitizer::hasTraversalAttempt($raw));
		$this->assertStringNotContainsString('..', PathSanitizer::normalize($raw));
	}

	public static function traversalProvider(): array
	{
		return [
			['../etc/passwd'],
			['api/../../secret'],
			['%2e%2e%2fapi'],
		];
	}
}
