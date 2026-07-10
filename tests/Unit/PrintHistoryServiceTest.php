<?php

declare(strict_types=1);

namespace OCA\NcPrint\Tests\Unit;

use OCA\NcPrint\Db\PrintRecord;
use OCA\NcPrint\Db\PrintRecordMapper;
use OCA\NcPrint\Service\PrintHistoryService;
use OCP\AppFramework\Utility\ITimeFactory;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * Unit-tests the pure aggregation + validation logic of PrintHistoryService.
 * The mapper is mocked so no DB is needed — we feed it the row shapes the real
 * QBMapper queries return and assert the derived metrics/wear.
 */
class PrintHistoryServiceTest extends TestCase
{
	private function service(PrintRecordMapper $mapper): PrintHistoryService
	{
		$time = $this->createMock(ITimeFactory::class);
		$time->method('getTime')->willReturn(1_700_000_000);
		return new PrintHistoryService($mapper, $time, $this->createMock(LoggerInterface::class));
	}

	private function mapper(): PrintRecordMapper
	{
		return $this->getMockBuilder(PrintRecordMapper::class)
			->disableOriginalConstructor()
			->getMock();
	}

	// ── record() validation ───────────────────────────────────────────────────

	public function testRecordRejectsEmptyUid(): void
	{
		$svc = $this->service($this->mapper());
		$this->assertNull($svc->record('', ['result' => 'complete']));
	}

	public function testRecordRejectsBadResult(): void
	{
		$svc = $this->service($this->mapper());
		$this->assertNull($svc->record('alice', ['result' => 'bogus']));
		$this->assertNull($svc->record('alice', []));
	}

	public function testRecordNormalizesAndInserts(): void
	{
		$mapper = $this->mapper();
		$captured = null;
		$mapper->method('insert')->willReturnCallback(function (PrintRecord $r) use (&$captured) {
			$captured = $r;
			return $r;
		});
		$svc = $this->service($mapper);
		$out = $svc->record('alice', [
			'result' => 'COMPLETE',
			'filename' => 'widget.gcode',
			'printer_id' => 'k1',
			'material' => 'PA-CF',
			'nozzle_diameter' => 0.4,
			'duration_s' => 3600,
			'slicer_duration_s' => 3000,
			'filament_g' => 42.5,
			'layer_height' => 0.2,
		]);
		$this->assertNotNull($out);
		$this->assertSame('complete', $captured->getResult());        // lower-cased
		$this->assertSame('pa-cf', $captured->getMaterial());          // normalized
		$this->assertSame(3600, $captured->getDurationS());
		$this->assertSame(1_700_000_000, $captured->getEndedAt());     // defaulted to now
		$this->assertSame(42.5, $captured->getFilamentG());
	}

	public function testRecordSwallowsMapperFailure(): void
	{
		$mapper = $this->mapper();
		$mapper->method('insert')->willThrowException(new \RuntimeException('db down'));
		$svc = $this->service($mapper);
		$this->assertNull($svc->record('alice', ['result' => 'error']));
	}

	// ── metrics() aggregation ─────────────────────────────────────────────────

	public function testMetricsComputesSuccessRateEtaAndTotals(): void
	{
		$mapper = $this->mapper();
		$mapper->method('resultCountsByPrinter')->willReturn([
			['printer_id' => 'k1', 'result' => 'complete', 'cnt' => 8],
			['printer_id' => 'k1', 'result' => 'error', 'cnt' => 2],
		]);
		$mapper->method('aggregateByPrinterMaterial')->willReturn([
			['printer_id' => 'k1', 'material' => 'pla', 'total' => 10,
				'sum_duration' => 36000, 'sum_filament' => 500.0],
		]);
		$mapper->method('durationPairs')->willReturn([
			['printer_id' => 'k1', 'duration_s' => 3300, 'slicer_duration_s' => 3000], // 1.1
			['printer_id' => 'k1', 'duration_s' => 2700, 'slicer_duration_s' => 3000], // 0.9
			['printer_id' => 'k1', 'duration_s' => 100,  'slicer_duration_s' => 10],   // 10.0 -> noise, dropped
		]);
		$svc = $this->service($mapper);
		$m = $svc->metrics('alice');

		$this->assertSame(10, $m['overall']['total']);
		$this->assertSame(0.8, $m['overall']['success_rate']);     // 8/10
		$this->assertSame(10.0, $m['overall']['print_hours']);     // 36000s / 3600
		$this->assertSame(500.0, $m['overall']['filament_g']);
		// eta ratio mean over the two in-band ratios (1.1, 0.9) = 1.0; the 10.0
		// outlier is excluded by the 0.3–3.0 sanity band.
		$this->assertSame(1.0, $m['overall']['eta_ratio_mean']);
		// median of durations 3300, 2700, 100 (all durations count) = 2700.
		$this->assertSame(2700, $m['overall']['median_duration_s']);
	}

	public function testMetricsEmptyWhenNoRows(): void
	{
		$mapper = $this->mapper();
		$mapper->method('resultCountsByPrinter')->willReturn([]);
		$mapper->method('aggregateByPrinterMaterial')->willReturn([]);
		$mapper->method('durationPairs')->willReturn([]);
		$svc = $this->service($mapper);
		$m = $svc->metrics('alice');
		$this->assertSame(0, $m['overall']['total']);
		$this->assertNull($m['overall']['success_rate']);
		$this->assertSame([], $m['by_printer']);
	}

	// ── wear() heuristics ─────────────────────────────────────────────────────

	public function testWearComputesNozzlePctAndClampsAt100(): void
	{
		$mapper = $this->mapper();
		// 500g abrasive against a 250g threshold => 200%, clamped to 100.
		$mapper->method('wearTotals')->willReturn([
			['printer_id' => 'k1', 'sum_duration' => 7200, 'sum_filament' => 1000.0,
				'sum_abrasive' => 500.0, 'total' => 5],
		]);
		$svc = $this->service($mapper);
		$w = $svc->wear('alice');
		$this->assertCount(1, $w['printers']);
		$p = $w['printers'][0];
		$this->assertSame(100.0, $p['nozzle_wear_pct']);           // clamped
		$this->assertSame(2.0, $p['print_hours']);                 // 7200 / 3600
		$this->assertNotEmpty($p['service_hints']);                // wear >= 80 => hint
		$this->assertArrayHasKey('disclaimer', $w);
	}

	public function testWearLowUsageHasNoHints(): void
	{
		$mapper = $this->mapper();
		$mapper->method('wearTotals')->willReturn([
			['printer_id' => 'k1', 'sum_duration' => 3600, 'sum_filament' => 100.0,
				'sum_abrasive' => 10.0, 'total' => 2],
		]);
		$svc = $this->service($mapper);
		$w = $svc->wear('alice');
		$p = $w['printers'][0];
		$this->assertSame(4.0, $p['nozzle_wear_pct']);             // 10/250 = 4%
		$this->assertSame([], $p['service_hints']);
	}
}
