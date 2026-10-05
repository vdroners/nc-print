<?php

declare(strict_types=1);

namespace OCA\NcPrint\Notification;

use OCA\NcPrint\AppInfo\Application;
use OCP\IURLGenerator;
use OCP\L10N\IFactory;
use OCP\Notification\INotification;
use OCP\Notification\INotifier;
use OCP\Notification\UnknownNotificationException;

/**
 * Renders nc_print notifications for the Nextcloud notification bell.
 *
 * Subjects: 'print_completed' / 'print_failed', each carrying
 * { filename, duration_human } parameters. Publishing happens in
 * PrinterController::notifyTransition (called by the frontend when it detects
 * the printing->complete / printing->error transition).
 */
class Notifier implements INotifier
{
	public function __construct(
		private IFactory $l10nFactory,
		private IURLGenerator $url,
	) {
	}

	public function getID(): string
	{
		return Application::APP_ID;
	}

	public function getName(): string
	{
		return $this->l10nFactory->get(Application::APP_ID)->t('NC 3D Print');
	}

	public function prepare(INotification $notification, string $languageCode): INotification
	{
		if ($notification->getApp() !== Application::APP_ID) {
			// Not our notification — required by the interface contract.
			$this->throwUnknown();
		}

		$l = $this->l10nFactory->get(Application::APP_ID, $languageCode);
		$params = $notification->getSubjectParameters();
		$filename = (string) ($params['filename'] ?? 'Print job');
		$duration = (string) ($params['duration_human'] ?? '');

		switch ($notification->getSubject()) {
			case 'print_completed':
				$notification->setParsedSubject(
					$duration !== ''
						? $l->t('Print complete: %1$s (%2$s)', [$filename, $duration])
						: $l->t('Print complete: %s', [$filename]),
				);
				$notification->setRichSubject(
					$l->t('Print complete: {file}'),
					['file' => ['type' => 'highlight', 'id' => $filename, 'name' => $filename]],
				);
				break;
			case 'print_failed':
				$notification->setParsedSubject($l->t('Print failed: %s', [$filename]));
				$notification->setRichSubject(
					$l->t('Print failed: {file}'),
					['file' => ['type' => 'highlight', 'id' => $filename, 'name' => $filename]],
				);
				break;
			default:
				$this->throwUnknown();
		}

		$notification->setIcon(
			$this->url->getAbsoluteURL($this->url->imagePath(Application::APP_ID, 'app.svg')),
		);
		$notification->setLink(
			$this->url->linkToRouteAbsolute(Application::APP_ID . '.page.index'),
		);

		return $notification;
	}

	/**
	 * Nextcloud 30+ expects UnknownNotificationException and logs a
	 * deprecation warning for every \InvalidArgumentException; older
	 * servers (min-version 28) only know the legacy exception.
	 */
	private function throwUnknown(): never
	{
		if (class_exists(UnknownNotificationException::class)) {
			throw new UnknownNotificationException();
		}
		throw new \InvalidArgumentException();
	}
}
