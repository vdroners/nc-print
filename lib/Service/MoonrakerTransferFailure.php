<?php

declare(strict_types=1);

namespace OCA\NcPrint\Service;

/**
 * Classifies a failed Moonraker upload hop so the UI can explain a timeout
 * versus an unreachable or reset link. The raw curl string is never returned:
 * it can contain the printer address. Callers decide whether to retry; this
 * class does not retry.
 */
final class MoonrakerTransferFailure
{
	public const TIMEOUT_MESSAGE = 'The upload timed out before the printer confirmed the file. The link may be too slow. Nothing was retried.';

	public const UNREACHABLE_MESSAGE = 'The connection to the printer dropped or could not be opened before the upload finished. Nothing was retried.';

	public const OTHER_MESSAGE = 'The upload did not finish. Nothing was retried.';

	/**
	 * Curl errno values we treat as "the link never stayed up". Named in
	 * comments so tests do not need the curl extension.
	 * 5 CURLE_COULDNT_RESOLVE_PROXY, 6 CURLE_COULDNT_RESOLVE_HOST,
	 * 7 CURLE_COULDNT_CONNECT, 18 CURLE_PARTIAL_FILE, 52 CURLE_GOT_NOTHING,
	 * 55 CURLE_SEND_ERROR, 56 CURLE_RECV_ERROR.
	 *
	 * @var list<int>
	 */
	private const LINK_DOWN_ERRNOS = [5, 6, 7, 18, 52, 55, 56];

	/**
	 * @return array{error: string, failure: string, message: string, retryable: bool}
	 */
	public static function classify(int $errno, string $error, int $httpCode): array
	{
		$text = strtolower($error);
		$connectTimeout = self::containsAny($text, [
			'connection timed out',
			'connect timed out',
			'failed to connect',
			'could not connect',
			"couldn't connect",
		]);
		$operationTimeout = $errno === 28
			|| $httpCode === 408
			|| $httpCode === 504
			|| str_contains($text, 'operation timed out')
			|| str_contains($text, 'timed out');

		if ($operationTimeout && !$connectTimeout && !self::isLinkDown($errno, $text, $httpCode)) {
			return self::result('moonraker_timeout', 'timeout', self::TIMEOUT_MESSAGE);
		}
		if ($connectTimeout || self::isLinkDown($errno, $text, $httpCode) || ($errno === 0 && $httpCode === 0)) {
			return self::result('moonraker_unreachable', 'unreachable', self::UNREACHABLE_MESSAGE);
		}

		$message = $httpCode > 0
			? 'The printer rejected the upload (HTTP ' . $httpCode . '). Nothing was retried.'
			: self::OTHER_MESSAGE;

		return self::result('moonraker_upload_failed', 'other', $message);
	}

	/**
	 * @return array{error: string, failure: string, message: string, retryable: bool}
	 */
	private static function result(string $error, string $failure, string $message): array
	{
		return [
			'error' => $error,
			'failure' => $failure,
			'message' => $message,
			'retryable' => true,
		];
	}

	private static function isLinkDown(int $errno, string $text, int $httpCode): bool
	{
		if (in_array($errno, self::LINK_DOWN_ERRNOS, true)) {
			return true;
		}
		if ($httpCode === 502 || $httpCode === 503) {
			return true;
		}

		return self::containsAny($text, [
			'connection reset',
			'recv failure',
			'send failure',
			'connection refused',
			'could not resolve',
			"couldn't resolve",
			'empty reply',
			'socket hang up',
		]);
	}

	/** @param list<string> $needles */
	private static function containsAny(string $haystack, array $needles): bool
	{
		foreach ($needles as $needle) {
			if (str_contains($haystack, $needle)) {
				return true;
			}
		}

		return false;
	}
}
