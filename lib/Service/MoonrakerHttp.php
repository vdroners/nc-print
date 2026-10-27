<?php

declare(strict_types=1);

namespace OCA\NcPrint\Service;

/**
 * Named Moonraker HTTP budgets for a weak Wi-Fi hop.
 *
 * Lab K1 Max (10.0.0.210, 2026-10-26): Moonraker :7125 flapped while the
 * stock UI and camera still answered. One recovering /printer/info took
 * ~3.1s. The health probe used to give up at 3s connect / 5s total, which
 * is inside that window. State and control calls already waited 60s total
 * but only 5s to connect, so a dropped SYN (retry around 1s + 2s + 4s)
 * could still fail them. See docs/notes/k1-max-wifi.md.
 *
 * Status reads may retry once on a transient connect failure. Pause,
 * cancel, emergency stop, gcode, print start, and uploads do not retry —
 * a second POST could double an action.
 */
final class MoonrakerHttp
{
	/** Health, print-guard, and webcam-list probes. */
	public const PROBE_CONNECT_SECONDS = 8;
	public const PROBE_TIMEOUT_SECONDS = 15;

	/** Printer state, capabilities, idle checks, proxy GETs. Total unchanged at 60s. */
	public const READ_CONNECT_SECONDS = 10;
	public const READ_TIMEOUT_SECONDS = 60;

	/** Pause / cancel / ESTOP / gcode / proxy POST. No retry. */
	public const CONTROL_CONNECT_SECONDS = 10;
	public const CONTROL_TIMEOUT_SECONDS = 60;

	/** G-code upload. Longer than status reads. No retry. */
	public const UPLOAD_TIMEOUT_SECONDS = 180;

	/** update_manager trigger. No retry. */
	public const UPDATE_TIMEOUT_SECONDS = 600;

	/**
	 * Per-host LAN discovery. Parallel, so wall-clock is about this timeout,
	 * not the host count. Raised so a ~3s Moonraker answer is not missed.
	 */
	public const DISCOVERY_CONNECT_MS = 4000;
	public const DISCOVERY_TIMEOUT_MS = 8000;

	/** Initial attempt plus one connect retry. */
	public const PROBE_MAX_ATTEMPTS = 2;

	public const CURL_COULDNT_RESOLVE_HOST = 6;
	public const CURL_COULDNT_CONNECT = 7;
	public const CURL_OPERATION_TIMEDOUT = 28;

	/**
	 * @return array{0: int, 1: int, 2: bool} timeout seconds, connect seconds, retry connect
	 */
	public static function curlBudget(string $profile): array
	{
		return match ($profile) {
			'probe' => [self::PROBE_TIMEOUT_SECONDS, self::PROBE_CONNECT_SECONDS, true],
			'read' => [self::READ_TIMEOUT_SECONDS, self::READ_CONNECT_SECONDS, true],
			'upload' => [self::UPLOAD_TIMEOUT_SECONDS, self::CONTROL_CONNECT_SECONDS, false],
			'update' => [self::UPDATE_TIMEOUT_SECONDS, self::CONTROL_CONNECT_SECONDS, false],
			default => [self::CONTROL_TIMEOUT_SECONDS, self::CONTROL_CONNECT_SECONDS, false],
		};
	}

	/**
	 * True only for failures that never finished the TCP handshake, or an
	 * immediate resolve/connect error. A timeout after connect (slow body)
	 * is not retried.
	 */
	public static function isTransientConnectFailure(int $curlErrno, float $connectTimeSeconds): bool
	{
		if ($curlErrno === self::CURL_COULDNT_RESOLVE_HOST || $curlErrno === self::CURL_COULDNT_CONNECT) {
			return true;
		}
		return $curlErrno === self::CURL_OPERATION_TIMEDOUT && $connectTimeSeconds <= 0.0;
	}

	/**
	 * Nextcloud/Guzzle client errors from Print Guard and webcam discovery.
	 */
	public static function throwableIsTransientConnect(\Throwable $e): bool
	{
		$msg = strtolower($e->getMessage());
		if (str_contains($msg, 'curl error 6') || str_contains($msg, 'curl error 7')) {
			return true;
		}
		if (str_contains($msg, 'failed to connect') || str_contains($msg, 'connection refused')) {
			return true;
		}
		if (str_contains($msg, 'could not resolve') || str_contains($msg, "couldn't resolve")) {
			return true;
		}
		return str_contains($msg, 'connection timed out');
	}

	/**
	 * @param callable(): array{body?: string|false, errno?: int, error?: string, http?: int, connectTime?: float} $attempt
	 * @return array{body: string|false, errno: int, error: string, http: int, connectTime: float, attempts: int}
	 */
	public static function runAttempts(callable $attempt, int $maxAttempts = self::PROBE_MAX_ATTEMPTS): array
	{
		$maxAttempts = max(1, $maxAttempts);
		$last = [
			'body' => false,
			'errno' => 0,
			'error' => '',
			'http' => 0,
			'connectTime' => 0.0,
			'attempts' => 0,
		];
		for ($i = 1; $i <= $maxAttempts; $i++) {
			$result = $attempt();
			$last = [
				'body' => $result['body'] ?? false,
				'errno' => (int) ($result['errno'] ?? 0),
				'error' => (string) ($result['error'] ?? ''),
				'http' => (int) ($result['http'] ?? 0),
				'connectTime' => (float) ($result['connectTime'] ?? 0),
				'attempts' => $i,
			];
			$transportFailed = $last['body'] === false || $last['errno'] !== 0 || $last['error'] !== '';
			if (!$transportFailed) {
				return $last;
			}
			if ($i >= $maxAttempts || !self::isTransientConnectFailure($last['errno'], $last['connectTime'])) {
				return $last;
			}
		}
		return $last;
	}

	/**
	 * @param \CurlHandle $ch
	 */
	public static function applyTimeouts($ch, int $timeoutSeconds, int $connectSeconds): void
	{
		curl_setopt($ch, CURLOPT_TIMEOUT, $timeoutSeconds);
		curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, $connectSeconds);
	}

	/**
	 * @param \CurlHandle $ch
	 * @return array{body: string|false, errno: int, error: string, http: int, connectTime: float, attempts: int}
	 */
	public static function exec($ch, bool $retryTransientConnect = false): array
	{
		$max = $retryTransientConnect ? self::PROBE_MAX_ATTEMPTS : 1;
		return self::runAttempts(static function () use ($ch): array {
			$body = curl_exec($ch);
			return [
				'body' => $body === false ? false : (string) $body,
				'errno' => curl_errno($ch),
				'error' => curl_error($ch),
				'http' => (int) curl_getinfo($ch, CURLINFO_HTTP_CODE),
				'connectTime' => (float) curl_getinfo($ch, CURLINFO_CONNECT_TIME),
			];
		}, $max);
	}
}
