<?php

declare(strict_types=1);

namespace OCA\NcPrint\Tests\Unit;

use PHPUnit\Framework\TestCase;

/**
 * The update-trigger is a disruptive write, so its guards are the whole point.
 * We assert the guards exist and the target allowlist is exactly the intended
 * set (source-scrape, consistent with the repo's other guard tests — building
 * the controller needs many OCP deps, and the live path is smoke-checked by the
 * gate + verified e2e).
 */
class UpdateControllerTest extends TestCase
{
	private function src(): string
	{
		return (string) file_get_contents(__DIR__ . '/../../lib/Controller/UpdateController.php');
	}

	public function testAdminGuardPresent(): void
	{
		$src = $this->src();
		// Must gate on isAdmin() (not just canUseApp) and 403 otherwise.
		$this->assertStringContainsString('$this->access->isAdmin()', $src);
		$this->assertStringContainsString('STATUS_FORBIDDEN', $src);
	}

	public function testIdleGuardPresent(): void
	{
		$src = $this->src();
		// Must query print_stats and refuse when busy / state unknown (fail closed).
		$this->assertStringContainsString('print_stats', $src);
		$this->assertStringContainsString('isPrinterBusy', $src);
		$this->assertMatchesRegularExpression('/BUSY_STATES\s*=\s*\[[^\]]*printing/', $src);
		$this->assertStringContainsString('STATUS_CONFLICT', $src);
	}

	public function testTargetAllowlistIsExact(): void
	{
		$src = $this->src();
		$this->assertMatchesRegularExpression(
			"/ALLOWED_TARGETS\s*=\s*\['klipper',\s*'moonraker',\s*'client',\s*'system',\s*'full'\]/",
			$src,
			'update target allowlist must be exactly klipper/moonraker/client/system/full',
		);
		// Rejects anything else with a 400.
		$this->assertStringContainsString('bad_target', $src);
		$this->assertStringContainsString('STATUS_BAD_REQUEST', $src);
	}

	public function testOnlyPostsToMachineUpdatePath(): void
	{
		$src = $this->src();
		// The only Moonraker write path is machine/update/<target> — never a
		// generic passthrough.
		$this->assertStringContainsString("'machine/update/' . \$target", $src);
		$this->assertStringNotContainsString('printer/gcode/script', $src);
	}

	public function testAdminAllowlistNotInGenericProxy(): void
	{
		// The generic Moonraker proxy must NOT have opened a machine/update write.
		$proxy = (string) file_get_contents(__DIR__ . '/../../lib/Controller/MoonrakerProxyController.php');
		$this->assertStringNotContainsString("'machine/update/klipper'", $proxy);
		$this->assertStringNotContainsString("'machine/update/full'", $proxy);
	}
}
