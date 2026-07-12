<?php

declare(strict_types=1);

namespace OCA\NcPrint\Controller;

use OCA\NcPrint\AppInfo\Application;
use OCA\NcPrint\Service\AccessService;
use OCA\NcPrint\Service\PrintHistoryService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IRequest;
use OCP\IUserSession;

/**
 * Print-history read/query endpoints. All rows are scoped to the session user;
 * the mapper filters by uid so one user can never read or delete another's
 * history (IDOR-safe). Access is gated to the configured groups like the rest of
 * the app. Recording happens in PrintEventController (the terminal-transition
 * hook), not here.
 */
class HistoryController extends Controller
{
	public function __construct(
		IRequest $request,
		private AccessService $access,
		private IUserSession $userSession,
		private PrintHistoryService $history,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	#[NoCSRFRequired]
	#[NoAdminRequired]
	public function list(): JSONResponse
	{
		$uid = $this->requireUid();
		if ($uid instanceof JSONResponse) {
			return $uid;
		}
		$filters = array_filter([
			'printer_id' => (string) $this->request->getParam('printer_id', ''),
			'material' => (string) $this->request->getParam('material', ''),
			'result' => (string) $this->request->getParam('result', ''),
			'from' => $this->intParam('from'),
			'to' => $this->intParam('to'),
		], static fn ($v) => $v !== '' && $v !== null);
		$limit = (int) ($this->intParam('limit') ?? 50);
		$offset = (int) ($this->intParam('offset') ?? 0);
		return new JSONResponse($this->history->list($uid, $filters, $limit, $offset));
	}

	#[NoCSRFRequired]
	#[NoAdminRequired]
	public function metrics(): JSONResponse
	{
		$uid = $this->requireUid();
		if ($uid instanceof JSONResponse) {
			return $uid;
		}
		return new JSONResponse($this->history->metrics($uid));
	}

	#[NoCSRFRequired]
	#[NoAdminRequired]
	public function wear(): JSONResponse
	{
		$uid = $this->requireUid();
		if ($uid instanceof JSONResponse) {
			return $uid;
		}
		return new JSONResponse($this->history->wear($uid));
	}

	#[NoCSRFRequired]
	#[NoAdminRequired]
	public function analytics(): JSONResponse
	{
		$uid = $this->requireUid();
		if ($uid instanceof JSONResponse) {
			return $uid;
		}
		$price = $this->request->getParam('price_per_kg', null);
		$pricePerKg = is_numeric($price) ? (float) $price : 25.0;
		return new JSONResponse($this->history->analytics($uid, $pricePerKg));
	}

	#[NoCSRFRequired]
	#[NoAdminRequired]
	public function destroy(int $id): JSONResponse
	{
		$uid = $this->requireUid();
		if ($uid instanceof JSONResponse) {
			return $uid;
		}
		return new JSONResponse(['ok' => true, 'deleted' => $this->history->delete($uid, $id)]);
	}

	#[NoCSRFRequired]
	#[NoAdminRequired]
	public function clear(): JSONResponse
	{
		$uid = $this->requireUid();
		if ($uid instanceof JSONResponse) {
			return $uid;
		}
		return new JSONResponse(['ok' => true, 'cleared' => $this->history->clear($uid)]);
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

	private function intParam(string $key): ?int
	{
		$v = $this->request->getParam($key, null);
		if ($v === null || $v === '' || !is_numeric($v)) {
			return null;
		}
		return (int) $v;
	}
}
