<?php

declare(strict_types=1);

namespace OCA\NcPrint\Service;

use OCP\IGroupManager;
use OCP\IUser;
use OCP\IUserSession;

class AccessService
{
	public const FORBIDDEN_MESSAGE = 'Access restricted to administrators or allowed group members.';

	public function __construct(
		private IUserSession $userSession,
		private IGroupManager $groupManager,
		private ConfigService $config,
	) {
	}

	public function getUser(): ?IUser
	{
		return $this->userSession->getUser();
	}

	public function requireUser(): IUser
	{
		$user = $this->getUser();
		if ($user === null) {
			throw new \RuntimeException('Not authenticated');
		}
		return $user;
	}

	public function canUseApp(?IUser $user = null): bool
	{
		$user ??= $this->getUser();
		if ($user === null) {
			return false;
		}

		if ($this->groupManager->isAdmin($user->getUID())) {
			return true;
		}

		foreach ($this->config->getAllowedGroups() as $groupId) {
			if ($this->groupManager->isInGroup($user->getUID(), $groupId)) {
				return true;
			}
		}

		return false;
	}

	/** @return array{error: string, message: string} */
	public function forbiddenJsonPayload(): array
	{
		return [
			'error' => 'forbidden',
			'message' => self::FORBIDDEN_MESSAGE,
		];
	}
}
