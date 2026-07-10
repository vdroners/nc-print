<?php

declare(strict_types=1);

namespace OCA\NcPrint\Controller;

use OCA\NcPrint\Activity\Provider;
use OCA\NcPrint\AppInfo\Application;
use OCA\NcPrint\Service\AccessService;
use OCA\NcPrint\Service\PrintHistoryService;
use OCP\Activity\IManager as IActivityManager;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IRequest;
use OCP\IUserSession;
use OCP\Notification\IManager as INotificationManager;
use Psr\Log\LoggerInterface;

/**
 * Bridges the client-side print-lifecycle transition into native Nextcloud
 * surfaces: a notification-bell entry and an Activity-stream event.
 *
 * The frontend already detects the printing->complete / printing->error edge
 * (store `_maybeNotifyPrintTransition`); it POSTs here so the transition is
 * published server-side for the current user. Publishing is idempotent enough
 * for practical use (the client only fires once per transition) and best-effort
 * — a failure here never blocks the UI.
 */
class PrintEventController extends Controller
{
	/** @var list<string> */
	private const VALID = ['complete', 'error', 'started', 'cancel'];

	/** Terminal transitions that produce a durable history row. */
	private const TERMINAL = ['complete', 'error', 'cancel'];

	public function __construct(
		IRequest $request,
		private AccessService $access,
		private IUserSession $userSession,
		private INotificationManager $notificationManager,
		private IActivityManager $activityManager,
		private PrintHistoryService $history,
		private LoggerInterface $logger,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	#[NoCSRFRequired]
	#[NoAdminRequired]
	public function notifyTransition(): JSONResponse
	{
		if (!$this->access->canUseApp()) {
			return new JSONResponse($this->access->forbiddenJsonPayload(), Http::STATUS_FORBIDDEN);
		}
		$user = $this->userSession->getUser();
		if ($user === null) {
			return new JSONResponse(['ok' => false], Http::STATUS_UNAUTHORIZED);
		}

		$params = $this->mergedParams();
		$transition = strtolower((string) ($params['transition'] ?? ''));
		if (!in_array($transition, self::VALID, true)) {
			return new JSONResponse(
				['error' => 'bad_transition', 'message' => 'transition must be one of: ' . implode(', ', self::VALID)],
				Http::STATUS_BAD_REQUEST,
			);
		}
		$filename = trim((string) ($params['filename'] ?? '')) ?: 'Print job';
		$printer = trim((string) ($params['printer'] ?? ''));
		$durationHuman = self::humanDuration($params['duration_s'] ?? null);
		$uid = $user->getUID();

		// Durable history: one row per terminated print. Best-effort — the
		// service swallows its own failures, and we never let it block the UI.
		if (in_array($transition, self::TERMINAL, true)) {
			$this->history->record($uid, [
				'result' => $transition,
				'filename' => $filename,
				'printer_id' => (string) ($params['printer_id'] ?? $printer),
				'printer_name' => $params['printer_name'] ?? ($printer ?: null),
				'material' => $params['material'] ?? null,
				'nozzle_diameter' => $params['nozzle_diameter'] ?? null,
				'failure_reason' => $params['failure_reason'] ?? null,
				'started_at' => $params['started_at'] ?? null,
				'ended_at' => $params['ended_at'] ?? null,
				'duration_s' => $params['duration_s'] ?? null,
				'slicer_duration_s' => $params['slicer_duration_s'] ?? null,
				'filament_g' => $params['filament_g'] ?? null,
				'filament_mm' => $params['filament_mm'] ?? null,
				'layer_height' => $params['layer_height'] ?? null,
			]);
		}

		// Cancel is history-only: the user knows they cancelled, so we don't fire
		// a "failed" bell/activity entry for it.
		if ($transition === 'cancel') {
			return new JSONResponse(['ok' => true, 'published' => false, 'recorded' => true]);
		}

		try {
			$this->publishNotification($uid, $transition, $filename, $durationHuman);
			$this->publishActivity($uid, $transition, $filename, $printer, $durationHuman);
		} catch (\Throwable $e) {
			// Never let a notification/activity failure surface as a UI error.
			$this->logger->warning('nc_print notifyTransition publish failed', ['exception' => $e]);
			return new JSONResponse(['ok' => true, 'published' => false]);
		}
		return new JSONResponse(['ok' => true, 'published' => true]);
	}

	private function publishNotification(string $uid, string $transition, string $filename, string $duration): void
	{
		if ($transition === 'started') {
			return; // Start is Activity-only; the bell is for terminal states.
		}
		$subject = $transition === 'complete' ? 'print_completed' : 'print_failed';
		$notification = $this->notificationManager->createNotification();
		$notification->setApp(Application::APP_ID)
			->setUser($uid)
			->setDateTime(new \DateTime())
			->setObject('print', $filename)
			->setSubject($subject, ['filename' => $filename, 'duration_human' => $duration]);
		$this->notificationManager->notify($notification);
	}

	private function publishActivity(string $uid, string $transition, string $filename, string $printer, string $duration): void
	{
		$subject = match ($transition) {
			'started' => Provider::SUBJECT_STARTED,
			'complete' => Provider::SUBJECT_COMPLETED,
			default => Provider::SUBJECT_FAILED,
		};
		$event = $this->activityManager->generateEvent();
		$event->setApp(Application::APP_ID)
			->setType('nc_print')
			->setAffectedUser($uid)
			->setAuthor($uid)
			->setObject('print', 0, $filename)
			->setSubject($subject, [
				'filename' => $filename,
				'printer' => $printer,
				'duration_human' => $duration,
			]);
		$this->activityManager->publish($event);
	}

	/**
	 * Format a duration in seconds as a compact human string ("2h 15m").
	 * Returns '' for missing/invalid input.
	 */
	public static function humanDuration(mixed $seconds): string
	{
		if (!is_numeric($seconds)) {
			return '';
		}
		$s = (int) round((float) $seconds);
		if ($s <= 0) {
			return '';
		}
		$h = intdiv($s, 3600);
		$m = intdiv($s % 3600, 60);
		if ($h > 0) {
			return $m > 0 ? "{$h}h {$m}m" : "{$h}h";
		}
		if ($m > 0) {
			return "{$m}m";
		}
		return "{$s}s";
	}

	private function mergedParams(): array
	{
		$params = $this->request->getParams();
		$raw = file_get_contents('php://input');
		if (is_string($raw) && $raw !== '') {
			$json = json_decode($raw, true);
			if (is_array($json)) {
				$params = array_merge($params, $json);
			}
		}
		return $params;
	}
}
