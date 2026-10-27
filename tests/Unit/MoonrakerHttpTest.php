<?php

declare(strict_types=1);

namespace OCA\NcPrint\Tests\Unit;

use OCA\NcPrint\Service\MoonrakerHttp;
use PHPUnit\Framework\TestCase;

class MoonrakerHttpTest extends TestCase
{
	public function testBudgetsSurviveAMultiSecondHopAndKeepUploadsLonger(): void
	{
		$this->assertSame(8, MoonrakerHttp::PROBE_CONNECT_SECONDS);
		$this->assertSame(15, MoonrakerHttp::PROBE_TIMEOUT_SECONDS);
		$this->assertGreaterThanOrEqual(8, MoonrakerHttp::PROBE_CONNECT_SECONDS);
		$this->assertGreaterThan(5, MoonrakerHttp::PROBE_TIMEOUT_SECONDS);

		$this->assertSame(10, MoonrakerHttp::READ_CONNECT_SECONDS);
		$this->assertSame(60, MoonrakerHttp::READ_TIMEOUT_SECONDS);
		$this->assertSame(10, MoonrakerHttp::CONTROL_CONNECT_SECONDS);
		$this->assertSame(60, MoonrakerHttp::CONTROL_TIMEOUT_SECONDS);
		$this->assertSame(180, MoonrakerHttp::UPLOAD_TIMEOUT_SECONDS);
		$this->assertSame(600, MoonrakerHttp::UPDATE_TIMEOUT_SECONDS);
		$this->assertSame(4000, MoonrakerHttp::DISCOVERY_CONNECT_MS);
		$this->assertSame(8000, MoonrakerHttp::DISCOVERY_TIMEOUT_MS);

		$this->assertGreaterThan(MoonrakerHttp::PROBE_TIMEOUT_SECONDS, MoonrakerHttp::READ_TIMEOUT_SECONDS);
		$this->assertGreaterThan(MoonrakerHttp::READ_TIMEOUT_SECONDS, MoonrakerHttp::UPLOAD_TIMEOUT_SECONDS);
		$this->assertGreaterThan(MoonrakerHttp::UPLOAD_TIMEOUT_SECONDS, MoonrakerHttp::UPDATE_TIMEOUT_SECONDS);
		$this->assertGreaterThan(900, MoonrakerHttp::DISCOVERY_TIMEOUT_MS);
	}

	public function testCurlBudgetRetriesReadsOnly(): void
	{
		[$timeout, $connect, $retry] = MoonrakerHttp::curlBudget('probe');
		$this->assertSame(MoonrakerHttp::PROBE_TIMEOUT_SECONDS, $timeout);
		$this->assertSame(MoonrakerHttp::PROBE_CONNECT_SECONDS, $connect);
		$this->assertTrue($retry);

		[, , $readRetry] = MoonrakerHttp::curlBudget('read');
		$this->assertTrue($readRetry);

		foreach (['control', 'upload', 'update', 'anything-else'] as $profile) {
			[, , $retry] = MoonrakerHttp::curlBudget($profile);
			$this->assertFalse($retry, $profile);
		}
		[$updateTimeout] = MoonrakerHttp::curlBudget('update');
		$this->assertSame(600, $updateTimeout);
		[$uploadTimeout] = MoonrakerHttp::curlBudget('upload');
		$this->assertSame(180, $uploadTimeout);
	}

	public function testTransientConnectClassification(): void
	{
		$this->assertTrue(MoonrakerHttp::isTransientConnectFailure(MoonrakerHttp::CURL_COULDNT_CONNECT, 0.2));
		$this->assertTrue(MoonrakerHttp::isTransientConnectFailure(MoonrakerHttp::CURL_COULDNT_RESOLVE_HOST, 0));
		$this->assertTrue(MoonrakerHttp::isTransientConnectFailure(MoonrakerHttp::CURL_OPERATION_TIMEDOUT, 0));
		// Body started — do not retry a slow read, and never a control POST.
		$this->assertFalse(MoonrakerHttp::isTransientConnectFailure(MoonrakerHttp::CURL_OPERATION_TIMEDOUT, 0.4));
		$this->assertFalse(MoonrakerHttp::isTransientConnectFailure(0, 0));
		$this->assertFalse(MoonrakerHttp::isTransientConnectFailure(56, 0.2));
	}

	public function testThrowableConnectClassification(): void
	{
		$this->assertTrue(MoonrakerHttp::throwableIsTransientConnect(new \RuntimeException(
			'cURL error 7: Failed to connect to 10.0.0.210 port 7125',
		)));
		$this->assertTrue(MoonrakerHttp::throwableIsTransientConnect(new \RuntimeException(
			'cURL error 28: Connection timed out after 8001 milliseconds',
		)));
		$this->assertFalse(MoonrakerHttp::throwableIsTransientConnect(new \RuntimeException(
			'cURL error 28: Operation timed out after 15000 milliseconds',
		)));
		$this->assertFalse(MoonrakerHttp::throwableIsTransientConnect(new \RuntimeException('HTTP 500')));
	}

	public function testRunAttemptsRetriesOnceThenStops(): void
	{
		$calls = 0;
		$result = MoonrakerHttp::runAttempts(static function () use (&$calls): array {
			$calls++;
			if ($calls === 1) {
				return [
					'body' => false,
					'errno' => MoonrakerHttp::CURL_COULDNT_CONNECT,
					'error' => 'connect failed',
					'http' => 0,
					'connectTime' => 0,
				];
			}
			return [
				'body' => '{"ok":true}',
				'errno' => 0,
				'error' => '',
				'http' => 200,
				'connectTime' => 0.3,
			];
		});
		$this->assertSame(2, $calls);
		$this->assertSame(2, $result['attempts']);
		$this->assertSame('{"ok":true}', $result['body']);
	}

	public function testRunAttemptsDoesNotRetryASlowRead(): void
	{
		$calls = 0;
		$result = MoonrakerHttp::runAttempts(static function () use (&$calls): array {
			$calls++;
			return [
				'body' => false,
				'errno' => MoonrakerHttp::CURL_OPERATION_TIMEDOUT,
				'error' => 'timed out',
				'http' => 0,
				'connectTime' => 1.2,
			];
		});
		$this->assertSame(1, $calls);
		$this->assertSame(1, $result['attempts']);
	}

	public function testRunAttemptsHonorsSingleAttemptForControl(): void
	{
		$calls = 0;
		MoonrakerHttp::runAttempts(static function () use (&$calls): array {
			$calls++;
			return [
				'body' => false,
				'errno' => MoonrakerHttp::CURL_COULDNT_CONNECT,
				'error' => 'connect failed',
				'http' => 0,
				'connectTime' => 0,
			];
		}, 1);
		$this->assertSame(1, $calls);
	}
}
