<?php

declare(strict_types=1);

namespace OCA\NcPrint\Activity;

use OCA\NcPrint\AppInfo\Application;
use OCP\Activity\ISetting;
use OCP\IL10N;

/**
 * Activity settings entry so users can toggle NC 3D Print print events in their
 * Activity preferences (and the events appear in the Activity app filter).
 */
class Setting implements ISetting
{
	public function __construct(
		private IL10N $l,
	) {
	}

	public function getIdentifier(): string
	{
		return Application::APP_ID;
	}

	public function getName(): string
	{
		return $this->l->t('A 3D print starts, completes or fails');
	}

	public function getPriority(): int
	{
		return 60;
	}

	public function canChangeStream(): bool
	{
		return true;
	}

	public function isDefaultEnabledStream(): bool
	{
		return true;
	}

	public function canChangeMail(): bool
	{
		return true;
	}

	public function isDefaultEnabledMail(): bool
	{
		return false;
	}
}
