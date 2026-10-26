<?php

declare(strict_types=1);

namespace OCA\NcPrint\Service;

use OCA\NcPrint\AppInfo\Application;
use OCP\Http\Client\IClientService;
use OCP\IConfig;
use Psr\Log\LoggerInterface;

/**
 * HMAC-signed outbound webhooks for print lifecycle events (Forge port Wave 2).
 *
 * Payload shape matches what forge-webhook-relay already accepts:
 *   { "event": "print_started|print_finished|…", "title": "…", "message": "…",
 *     "data": { "printer_id", "filename", … } }
 * Signature header: X-Hub-Signature-256: sha256=<hex>
 */
class OutboundWebhookService
{
	public const KEY_WEBHOOK_URL = 'outbound_webhook_url';
	public const KEY_WEBHOOK_SECRET = 'outbound_webhook_secret';
	public const KEY_WEBHOOK_ENABLED = 'outbound_webhook_enabled';

	/** @var array<string, string> */
	private const TRANSITION_EVENT = [
		'started' => 'print_started',
		'complete' => 'print_finished',
		'error' => 'print_failed',
		'cancel' => 'print_cancelled',
		'paused' => 'print_paused',
		'progress' => 'print_progress',
		'offline' => 'printer_offline',
		'guard' => 'protection_alert',
	];

	public function __construct(
		private IConfig $config,
		private IClientService $clientService,
		private LoggerInterface $logger,
	) {
	}

	public function isEnabled(): bool
	{
		$flag = $this->config->getAppValue(Application::APP_ID, self::KEY_WEBHOOK_ENABLED, '0');
		if ($flag !== '1' && $flag !== 'yes' && $flag !== 'true') {
			return false;
		}
		return $this->getUrl() !== '' && $this->getSecret() !== '';
	}

	public function getUrl(): string
	{
		return trim($this->config->getAppValue(Application::APP_ID, self::KEY_WEBHOOK_URL, ''));
	}

	public function getSecret(): string
	{
		return trim($this->config->getAppValue(Application::APP_ID, self::KEY_WEBHOOK_SECRET, ''));
	}

	/**
	 * Map a PrintEventController transition (or synthetic event) to a webhook event name.
	 */
	public static function eventForTransition(string $transition): ?string
	{
		$t = strtolower(trim($transition));
		return self::TRANSITION_EVENT[$t] ?? null;
	}

	/**
	 * Build canonical JSON body + signature (for tests + delivery).
	 *
	 * @param array<string, mixed> $data
	 * @return array{body: string, signature: string, event: string}
	 */
	public static function buildSignedPayload(
		string $event,
		string $title,
		string $message,
		array $data,
		string $secret,
	): array {
		$payload = [
			'event' => $event,
			'title' => $title,
			'message' => $message,
			'source' => 'nc_print',
			'data' => $data,
			'ts' => time(),
		];
		$body = json_encode($payload, JSON_UNESCAPED_SLASHES);
		if ($body === false) {
			$body = '{}';
		}
		$sig = 'sha256=' . hash_hmac('sha256', $body, $secret);
		return ['body' => $body, 'signature' => $sig, 'event' => $event];
	}

	/**
	 * Verify an HMAC signature against a raw body (unit + relay dual-run helper).
	 */
	public static function verifySignature(string $body, string $header, string $secret): bool
	{
		if ($secret === '' || $header === '') {
			return false;
		}
		if (!str_starts_with($header, 'sha256=')) {
			return false;
		}
		$expected = 'sha256=' . hash_hmac('sha256', $body, $secret);
		return hash_equals($expected, $header);
	}

	/**
	 * Fire a lifecycle webhook. Best-effort — never throws to callers.
	 *
	 * @param array<string, mixed> $data
	 * @return array{ok: bool, skipped?: bool, status?: int, error?: string}
	 */
	public function dispatch(string $transitionOrEvent, string $title, string $message, array $data = []): array
	{
		if (!$this->isEnabled()) {
			return ['ok' => true, 'skipped' => true];
		}
		$event = self::eventForTransition($transitionOrEvent) ?? $transitionOrEvent;
		if ($event === '') {
			return ['ok' => false, 'error' => 'bad_event'];
		}
		$url = $this->getUrl();
		$secret = $this->getSecret();
		$signed = self::buildSignedPayload($event, $title, $message, $data, $secret);

		try {
			$client = $this->clientService->newClient();
			$response = $client->post($url, [
				'body' => $signed['body'],
				'headers' => [
					'Content-Type' => 'application/json',
					'X-Hub-Signature-256' => $signed['signature'],
					'User-Agent' => 'nc_print-outbound-webhook/1',
				],
				'timeout' => 8,
				'connect_timeout' => 3,
			]);
			$status = $response->getStatusCode();
			if ($status >= 200 && $status < 300) {
				return ['ok' => true, 'status' => $status];
			}
			$this->logger->warning('nc_print outbound webhook non-2xx', [
				'status' => $status,
				'event' => $event,
			]);
			return ['ok' => false, 'status' => $status, 'error' => 'http_' . $status];
		} catch (\Throwable $e) {
			$this->logger->warning('nc_print outbound webhook failed', [
				'exception' => $e,
				'event' => $event,
			]);
			return ['ok' => false, 'error' => $e->getMessage()];
		}
	}
}
