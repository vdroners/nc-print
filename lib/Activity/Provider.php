<?php

declare(strict_types=1);

namespace OCA\NcPrint\Activity;

use OCA\NcPrint\AppInfo\Application;
use OCP\Activity\IEvent;
use OCP\Activity\IProvider;
use OCP\IL10N;
use OCP\IURLGenerator;
use OCP\L10N\IFactory;

/**
 * Renders nc_print activity events (print started / completed / failed) for the
 * Nextcloud Activity stream. Events are published from
 * PrinterController::notifyTransition and the send-to-printer flow.
 */
class Provider implements IProvider
{
	public const SUBJECT_STARTED = 'print_started';
	public const SUBJECT_COMPLETED = 'print_completed';
	public const SUBJECT_FAILED = 'print_failed';

	public function __construct(
		private IFactory $l10nFactory,
		private IURLGenerator $url,
	) {
	}

	public function parse(string $language, IEvent $event, ?IEvent $previousEvent = null): IEvent
	{
		if ($event->getApp() !== Application::APP_ID) {
			throw new \InvalidArgumentException();
		}
		$l = $this->l10nFactory->get(Application::APP_ID, $language);
		$params = $event->getSubjectParameters();
		$file = (string) ($params['filename'] ?? 'Print job');
		$printer = (string) ($params['printer'] ?? '');
		$duration = (string) ($params['duration_human'] ?? '');

		$event->setIcon(
			$this->url->getAbsoluteURL($this->url->imagePath(Application::APP_ID, 'app.svg')),
		);

		switch ($event->getSubject()) {
			case self::SUBJECT_STARTED:
				$event->setParsedSubject($this->withPrinter($l->t('Started printing %s', [$file]), $printer, $l));
				break;
			case self::SUBJECT_COMPLETED:
				$base = $duration !== ''
					? $l->t('Completed print %1$s in %2$s', [$file, $duration])
					: $l->t('Completed print %s', [$file]);
				$event->setParsedSubject($this->withPrinter($base, $printer, $l));
				break;
			case self::SUBJECT_FAILED:
				$event->setParsedSubject($this->withPrinter($l->t('Print failed: %s', [$file]), $printer, $l));
				break;
			default:
				throw new \InvalidArgumentException();
		}

		return $event;
	}

	private function withPrinter(string $base, string $printer, IL10N $l): string
	{
		return $printer !== '' ? $base . ' ' . $l->t('on %s', [$printer]) : $base;
	}
}
