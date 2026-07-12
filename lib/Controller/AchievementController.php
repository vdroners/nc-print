<?php

declare(strict_types=1);

namespace OCA\NcPrint\Controller;

use OCA\NcPrint\AppInfo\Application;
use OCA\NcPrint\Service\AccessService;
use OCA\NcPrint\Service\AchievementService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IRequest;
use OCP\IUserSession;

/**
 * Per-user achievements, derived from the session user's print history. Read-only
 * and IDOR-safe: the uid comes from the session, never from the request.
 */
class AchievementController extends Controller
{
	public function __construct(
		IRequest $request,
		private AccessService $access,
		private IUserSession $userSession,
		private AchievementService $achievements,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	#[NoCSRFRequired]
	#[NoAdminRequired]
	public function list(): JSONResponse
	{
		if (!$this->access->canUseApp()) {
			return new JSONResponse($this->access->forbiddenJsonPayload(), Http::STATUS_FORBIDDEN);
		}
		$user = $this->userSession->getUser();
		if ($user === null) {
			return new JSONResponse(['ok' => false], Http::STATUS_UNAUTHORIZED);
		}
		return new JSONResponse($this->achievements->list($user->getUID()));
	}
}
