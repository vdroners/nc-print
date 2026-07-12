<?php

declare(strict_types=1);

namespace OCA\NcPrint\Controller;

use OCA\NcPrint\AppInfo\Application;
use OCA\NcPrint\Service\AccessService;
use OCA\NcPrint\Service\MaintenanceService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IRequest;
use OCP\IUserSession;

/**
 * Maintenance / wear-log endpoints. All rows are scoped to the session user; the
 * mapper filters by uid so one user can never read or write another's
 * maintenance log (IDOR-safe). Access is gated to the configured groups like the
 * rest of the app.
 */
class MaintenanceController extends Controller
{
	public function __construct(
		IRequest $request,
		private AccessService $access,
		private IUserSession $userSession,
		private MaintenanceService $maintenance,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	#[NoCSRFRequired]
	#[NoAdminRequired]
	public function summary(): JSONResponse
	{
		$uid = $this->requireUid();
		if ($uid instanceof JSONResponse) {
			return $uid;
		}
		return new JSONResponse($this->maintenance->summary($uid));
	}

	#[NoCSRFRequired]
	#[NoAdminRequired]
	public function log(): JSONResponse
	{
		$uid = $this->requireUid();
		if ($uid instanceof JSONResponse) {
			return $uid;
		}
		$logged = $this->maintenance->log($uid, [
			'printer_id' => $this->request->getParam('printer_id', ''),
			'component' => $this->request->getParam('component', ''),
			'action' => $this->request->getParam('action', ''),
			'hours_at' => $this->request->getParam('hours_at', null),
			'cost' => $this->request->getParam('cost', null),
			'notes' => $this->request->getParam('notes', null),
		]);
		if ($logged === null) {
			return new JSONResponse(['ok' => false, 'error' => 'invalid'], Http::STATUS_BAD_REQUEST);
		}
		return new JSONResponse($logged);
	}

	/** @return string|JSONResponse the uid, or an error response to return */
	private function requireUid(): string|JSONResponse
	{
		if (!$this->access->canUseApp()) {
			return new JSONResponse($this->access->forbiddenJsonPayload(), Http::STATUS_FORBIDDEN);
		}
		$user = $this->userSession->getUser();
		if ($user === null) {
			return new JSONResponse(['ok' => false], Http::STATUS_UNAUTHORIZED);
		}
		return $user->getUID();
	}
}
