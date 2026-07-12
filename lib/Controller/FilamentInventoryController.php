<?php

declare(strict_types=1);

namespace OCA\NcPrint\Controller;

use OCA\NcPrint\AppInfo\Application;
use OCA\NcPrint\Service\AccessService;
use OCA\NcPrint\Service\FilamentInventoryService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IRequest;
use OCP\IUserSession;

/**
 * Filament/spool inventory CRUD. All rows are scoped to the session user; the
 * mapper filters by uid so one user can never read, edit or delete another's
 * spools (IDOR-safe). Access is gated to the configured groups like the rest of
 * the app.
 */
class FilamentInventoryController extends Controller
{
	public function __construct(
		IRequest $request,
		private AccessService $access,
		private IUserSession $userSession,
		private FilamentInventoryService $inventory,
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
		return new JSONResponse($this->inventory->list($uid, (bool) $this->request->getParam('archived')));
	}

	#[NoCSRFRequired]
	#[NoAdminRequired]
	public function create(): JSONResponse
	{
		$uid = $this->requireUid();
		if ($uid instanceof JSONResponse) {
			return $uid;
		}
		$created = $this->inventory->create($uid, $this->readParams());
		if ($created === null) {
			return new JSONResponse(['ok' => false, 'error' => 'invalid'], Http::STATUS_BAD_REQUEST);
		}
		return new JSONResponse($created);
	}

	#[NoCSRFRequired]
	#[NoAdminRequired]
	public function update(int $id): JSONResponse
	{
		$uid = $this->requireUid();
		if ($uid instanceof JSONResponse) {
			return $uid;
		}
		$updated = $this->inventory->update($uid, $id, $this->readParams());
		if ($updated === null) {
			return new JSONResponse(['ok' => false, 'error' => 'not_found'], Http::STATUS_NOT_FOUND);
		}
		return new JSONResponse($updated);
	}

	#[NoCSRFRequired]
	#[NoAdminRequired]
	public function destroy(int $id): JSONResponse
	{
		$uid = $this->requireUid();
		if ($uid instanceof JSONResponse) {
			return $uid;
		}
		return new JSONResponse(['ok' => true, 'deleted' => $this->inventory->delete($uid, $id)]);
	}

	/**
	 * Read the writable spool fields from the request into a flat array. Only
	 * keys that were actually sent are included, so PUT applies a partial update.
	 *
	 * @return array<string,mixed>
	 */
	private function readParams(): array
	{
		$keys = ['brand', 'material', 'color_name', 'color_hex', 'diameter',
			'weight_total_g', 'weight_remaining_g', 'cost', 'currency', 'location', 'notes'];
		$out = [];
		foreach ($keys as $key) {
			$v = $this->request->getParam($key, null);
			if ($v !== null) {
				$out[$key] = $v;
			}
		}
		return $out;
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
