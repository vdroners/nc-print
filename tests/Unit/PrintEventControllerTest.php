<?php

declare(strict_types=1);

namespace OCA\NcPrint\Tests\Unit;

use OCA\NcPrint\Controller\PrintEventController;
use PHPUnit\Framework\TestCase;

/**
 * Covers the pure duration formatter. The publish path is integration-level
 * (needs the notification/activity managers) and is exercised on the live
 * stack; here we lock down the human-duration formatting the bell/activity use.
 */
class PrintEventControllerTest extends TestCase
{
	public function testHumanDurationFormats(): void
	{
		$this->assertSame('2h 15m', PrintEventController::humanDuration(8100));
		$this->assertSame('1h', PrintEventController::humanDuration(3600));
		$this->assertSame('45m', PrintEventController::humanDuration(2700));
		$this->assertSame('30s', PrintEventController::humanDuration(30));
	}

	public function testHumanDurationRejectsBadInput(): void
	{
		$this->assertSame('', PrintEventController::humanDuration(0));
		$this->assertSame('', PrintEventController::humanDuration(-5));
		$this->assertSame('', PrintEventController::humanDuration(null));
		$this->assertSame('', PrintEventController::humanDuration('abc'));
	}
}
