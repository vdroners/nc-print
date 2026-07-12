<?php

declare(strict_types=1);

namespace OCA\NcPrint\Tests\Unit;

use OCA\NcPrint\Db\Spool;
use OCA\NcPrint\Db\SpoolMapper;
use OCA\NcPrint\Db\MaintenanceRecord;
use OCA\NcPrint\Db\MaintenanceRecordMapper;
use OCA\NcPrint\Service\AchievementService;
use OCA\NcPrint\Service\FilamentInventoryService;
use OCA\NcPrint\Service\MaintenanceService;
use OCA\NcPrint\Service\PrintHistoryService;
use OCP\AppFramework\Utility\ITimeFactory;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * Pure-logic unit tests for the Overview management pillars (v1.55.0):
 * achievements derivation, filament inventory validation/rollup, and maintenance
 * wear math. Mappers + PrintHistoryService are mocked so no DB is needed.
 */
class OverviewPillarsTest extends TestCase
{
	private function history(array $overall, array $byPrinter = []): PrintHistoryService
	{
		$svc = $this->getMockBuilder(PrintHistoryService::class)
			->disableOriginalConstructor()
			->getMock();
		$svc->method('metrics')->willReturn(['overall' => $overall, 'by_printer' => $byPrinter]);
		return $svc;
	}

	// ── Achievements ──────────────────────────────────────────────────────────

	public function testAchievementsEarnedAndLocked(): void
	{
		$history = $this->history(
			['total' => 12, 'complete' => 12, 'error' => 0, 'cancel' => 0,
				'filament_g' => 1500.0, 'print_hours' => 30.0, 'success_rate' => 1.0],
			[['printer_id' => 'k1', 'materials' => ['pla' => 8, 'petg' => 4]]],
		);
		$svc = new AchievementService($history, $this->createMock(LoggerInterface::class));
		$out = $svc->list('alice');

		$byId = [];
		foreach ($out['achievements'] as $a) {
			$byId[$a['id']] = $a;
		}
		$this->assertTrue($byId['first_print']['earned']);   // 12 >= 1
		$this->assertTrue($byId['prints_10']['earned']);     // 12 >= 10
		$this->assertFalse($byId['prints_50']['earned']);    // 12 < 50
		$this->assertTrue($byId['filament_1kg']['earned']);  // 1.5kg >= 1
		$this->assertFalse($byId['filament_10kg']['earned']); // 1.5 < 10
		$this->assertTrue($byId['hours_24']['earned']);      // 30 >= 24
		$this->assertGreaterThan(0, $out['summary']['earned']);
		$this->assertGreaterThan(0, $out['summary']['xp']);
	}

	public function testAchievementsSuccessRateOnlyCountsWith20Prints(): void
	{
		// Under 20 prints → no success-rate achievements in the list.
		$svc = new AchievementService(
			$this->history(['total' => 5, 'complete' => 5, 'filament_g' => 0, 'print_hours' => 0, 'success_rate' => 1.0]),
			$this->createMock(LoggerInterface::class),
		);
		$ids = array_column($svc->list('bob')['achievements'], 'id');
		$this->assertNotContains('success_95', $ids);
	}

	public function testAchievementsEmptyHistoryAllLocked(): void
	{
		$svc = new AchievementService(
			$this->history(['total' => 0, 'complete' => 0, 'filament_g' => 0, 'print_hours' => 0, 'success_rate' => null]),
			$this->createMock(LoggerInterface::class),
		);
		$out = $svc->list('carol');
		$this->assertSame(0, $out['summary']['earned']);
		$this->assertGreaterThan(0, $out['summary']['total']);
	}

	// ── Filament inventory ──────────────────────────────────────────────────────

	private function spoolMapper(): SpoolMapper
	{
		return $this->getMockBuilder(SpoolMapper::class)->disableOriginalConstructor()->getMock();
	}

	private function filamentSvc(SpoolMapper $mapper): FilamentInventoryService
	{
		$time = $this->createMock(ITimeFactory::class);
		$time->method('getTime')->willReturn(1_700_000_000);
		return new FilamentInventoryService($mapper, $time, $this->createMock(LoggerInterface::class));
	}

	public function testFilamentCreateValidatesAndInserts(): void
	{
		$mapper = $this->spoolMapper();
		$captured = null;
		$mapper->method('insert')->willReturnCallback(function (Spool $s) use (&$captured) {
			$captured = $s;
			return $s;
		});
		$out = $this->filamentSvc($mapper)->create('alice', [
			'brand' => 'Polymaker',
			'material' => 'PLA',
			'color_hex' => 'ff8800',
			'weight_total_g' => 1000,
			'cost' => 22.5,
		]);
		$this->assertNotNull($out);
		$this->assertSame('Polymaker', $captured->getBrand());
		// remaining defaults to total when not supplied.
		$this->assertSame(1000.0, (float) $captured->getWeightRemainingG());
		// hex normalized with leading '#'.
		$this->assertSame('#ff8800', $captured->getColorHex());
	}

	public function testFilamentListSummaryCountsLowStock(): void
	{
		$full = new Spool();
		$full->setWeightTotalG(1000);
		$full->setWeightRemainingG(900);
		$low = new Spool();
		$low->setWeightTotalG(1000);
		$low->setWeightRemainingG(50); // 5% -> low
		$mapper = $this->spoolMapper();
		$mapper->method('findByUser')->willReturn([$full, $low]);
		$out = $this->filamentSvc($mapper)->list('alice');
		$this->assertSame(2, $out['summary']['count']);
		$this->assertSame(1, $out['summary']['low_stock']);
	}

	// ── Maintenance ─────────────────────────────────────────────────────────────

	private function maintSvc(MaintenanceRecordMapper $mapper, PrintHistoryService $history): MaintenanceService
	{
		$time = $this->createMock(ITimeFactory::class);
		$time->method('getTime')->willReturn(1_700_000_000);
		return new MaintenanceService($mapper, $history, $time, $this->createMock(LoggerInterface::class));
	}

	private function wearHistory(array $printers): PrintHistoryService
	{
		$svc = $this->getMockBuilder(PrintHistoryService::class)->disableOriginalConstructor()->getMock();
		$svc->method('wear')->willReturn(['printers' => $printers, 'threshold_g' => 250.0,
			'ptfe_inspect_hours' => 500.0, 'disclaimer' => '']);
		return $svc;
	}

	public function testMaintenanceComputesPercentUsedFromPrintHours(): void
	{
		// 380 print-hours, no maintenance logged → brass nozzle (400h) ~95% → critical.
		$mapper = $this->getMockBuilder(MaintenanceRecordMapper::class)->disableOriginalConstructor()->getMock();
		$mapper->method('latestByComponent')->willReturn([]);
		$history = $this->wearHistory([['printer_id' => 'k1', 'print_hours' => 380.0]]);
		$out = $this->maintSvc($mapper, $history)->summary('alice');
		$this->assertNotEmpty($out['printers']);
		$comps = [];
		foreach ($out['printers'][0]['components'] as $c) {
			$comps[$c['component']] = $c;
		}
		$this->assertArrayHasKey('brass_nozzle', $comps);
		$this->assertGreaterThanOrEqual(90, $comps['brass_nozzle']['percent_used']);
		$this->assertContains($comps['brass_nozzle']['status'], ['warning', 'critical']);
	}
}
