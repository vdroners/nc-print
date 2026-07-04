<?php

declare(strict_types=1);

namespace OCA\NcPrint\Tests\Unit;

use OCA\NcPrint\Service\EtaLearningService;
use OCP\IConfig;
use PHPUnit\Framework\TestCase;

class EtaLearningServiceTest extends TestCase
{
	/**
	 * An IConfig mock backed by an in-memory store, so recordCompletion() can
	 * persist and predict() can read it back — modelling the real app-config
	 * round trip without a database.
	 */
	private function makeService(): EtaLearningService
	{
		$store = [];
		$config = $this->createMock(IConfig::class);
		$config->method('getAppValue')->willReturnCallback(
			static function (string $app, string $key, $default = '') use (&$store) {
				return $store["$app/$key"] ?? $default;
			}
		);
		$config->method('setAppValue')->willReturnCallback(
			static function (string $app, string $key, $value) use (&$store): void {
				$store["$app/$key"] = $value;
			}
		);
		return new EtaLearningService($config);
	}

	public function testUnknownBucketReturnsSlicerEstimateUnchanged(): void
	{
		$svc = $this->makeService();
		$p = $svc->predict(100.0, ['printerId' => 'k1', 'material' => 'PLA']);
		$this->assertSame(100.0, $p['predicted_minutes']);
		$this->assertSame(1.0, $p['multiplier']);
		$this->assertSame(0, $p['samples']);
		$this->assertSame(0.0, $p['confidence']);
	}

	public function testNoPrinterIdEchoesSlicerEstimate(): void
	{
		$svc = $this->makeService();
		$p = $svc->predict(90.0, ['material' => 'PLA']);
		$this->assertSame(90.0, $p['predicted_minutes']);
		$this->assertSame(0, $p['samples']);
	}

	public function testFirstRecordSeedsMultiplierToRatio(): void
	{
		$svc = $this->makeService();
		// Actual took 20% longer than the slicer said.
		$bucket = $svc->recordCompletion(['printerId' => 'k1', 'material' => 'PLA'], 100.0, 120.0);
		$this->assertNotNull($bucket);
		$this->assertSame(1, $bucket['samples']);
		$this->assertEqualsWithDelta(1.2, $bucket['multiplier'], 1e-9);

		$p = $svc->predict(100.0, ['printerId' => 'k1', 'material' => 'PLA']);
		$this->assertSame(120.0, $p['predicted_minutes']);
		$this->assertEqualsWithDelta(1.2, $p['multiplier'], 1e-9);
		$this->assertSame(1, $p['samples']);
	}

	public function testEwmaConvergesTowardObservedRatio(): void
	{
		$svc = $this->makeService();
		$ctx = ['printerId' => 'k1', 'material' => 'PLA'];
		// Every print runs 50% long. EWMA (alpha=0.25) should climb toward 1.5.
		$last = null;
		for ($i = 0; $i < 12; $i++) {
			$last = $svc->recordCompletion($ctx, 100.0, 150.0);
		}
		$this->assertSame(12, $last['samples']);
		$this->assertGreaterThan(1.4, $last['multiplier']);
		$this->assertLessThanOrEqual(1.5, $last['multiplier']);
	}

	public function testConfidenceGrowsWithSamplesAndSaturates(): void
	{
		$svc = $this->makeService();
		$ctx = ['printerId' => 'k1', 'material' => 'PETG'];
		for ($i = 0; $i < 5; $i++) {
			$svc->recordCompletion($ctx, 100.0, 100.0);
		}
		$p5 = $svc->predict(100.0, $ctx);
		$this->assertEqualsWithDelta(0.5, $p5['confidence'], 1e-9); // 5/10

		for ($i = 0; $i < 20; $i++) {
			$svc->recordCompletion($ctx, 100.0, 100.0);
		}
		$p = $svc->predict(100.0, $ctx);
		$this->assertSame(1.0, $p['confidence']); // saturates at 10 samples
	}

	public function testOutOfBandRatiosAreRejected(): void
	{
		$svc = $this->makeService();
		$ctx = ['printerId' => 'k1'];
		// 5x (paused print / tracking bug) and 0.1x are both outside 0.3..3.0.
		$this->assertNull($svc->recordCompletion($ctx, 100.0, 500.0));
		$this->assertNull($svc->recordCompletion($ctx, 100.0, 10.0));
		// Nothing learned -> still an unknown bucket.
		$this->assertSame(0, $svc->predict(100.0, $ctx)['samples']);
	}

	public function testNonPositiveAndMissingInputsRejected(): void
	{
		$svc = $this->makeService();
		$this->assertNull($svc->recordCompletion(['printerId' => 'k1'], 0.0, 100.0));
		$this->assertNull($svc->recordCompletion(['printerId' => 'k1'], 100.0, 0.0));
		$this->assertNull($svc->recordCompletion([], 100.0, 100.0)); // no printerId
	}

	public function testBucketsAreKeyedByMaterialAndNozzle(): void
	{
		$svc = $this->makeService();
		$svc->recordCompletion(['printerId' => 'k1', 'material' => 'PLA', 'nozzleDiameter' => 0.4], 100.0, 120.0);
		$svc->recordCompletion(['printerId' => 'k1', 'material' => 'ABS', 'nozzleDiameter' => 0.4], 100.0, 80.0);
		$svc->recordCompletion(['printerId' => 'k1', 'material' => 'PLA', 'nozzleDiameter' => 0.6], 100.0, 90.0);

		$this->assertEqualsWithDelta(1.2, $svc->predict(100.0, ['printerId' => 'k1', 'material' => 'PLA'])['multiplier'], 1e-9);
		$this->assertEqualsWithDelta(0.8, $svc->predict(100.0, ['printerId' => 'k1', 'material' => 'ABS'])['multiplier'], 1e-9);
		// PLA @ 0.6 is a distinct bucket from PLA @ 0.4 (default).
		$this->assertEqualsWithDelta(0.9, $svc->predict(100.0, ['printerId' => 'k1', 'material' => 'PLA', 'nozzleDiameter' => 0.6])['multiplier'], 1e-9);

		$buckets = $svc->listForPrinter('k1');
		$this->assertCount(3, $buckets);
	}
}
