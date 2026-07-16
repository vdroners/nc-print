<?php

declare(strict_types=1);

namespace OCA\NcPrint\Controller;

use OCA\NcPrint\AppInfo\Application;
use OCA\NcPrint\Service\AccessService;
use OCA\NcPrint\Service\FileFetchService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\JSONResponse;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use OCP\IRequest;

class GcodeSaveController extends Controller
{
	private const MAX_BYTES = 50 * 1024 * 1024;

	public function __construct(
		IRequest $request,
		private AccessService $access,
		private FileFetchService $files,
		private IRootFolder $rootFolder,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function saveGcode(): JSONResponse
	{
		if (!$this->access->canUseApp()) {
			return new JSONResponse($this->access->forbiddenJsonPayload(), Http::STATUS_FORBIDDEN);
		}

		try {
			[$fileId, $davPath, $gcodeContent] = $this->parseRequestBody();
		} catch (\InvalidArgumentException $e) {
			return new JSONResponse(['error' => $e->getMessage()], Http::STATUS_BAD_REQUEST);
		}

		if ($gcodeContent === '') {
			return new JSONResponse(['error' => 'gcode_required'], Http::STATUS_BAD_REQUEST);
		}
		if (strlen($gcodeContent) > self::MAX_BYTES) {
			return new JSONResponse(['error' => 'gcode_too_large'], Http::STATUS_BAD_REQUEST);
		}
		if ($fileId <= 0 && $davPath === '') {
			return new JSONResponse(['error' => 'model_reference_required'], Http::STATUS_BAD_REQUEST);
		}

		try {
			$user = $this->access->requireUser();
			$root = $this->rootFolder->getUserFolder($user->getUID());
			$model = $this->files->resolveModelNode(
				$root,
				$davPath !== '' ? $davPath : null,
				$fileId > 0 ? $fileId : null,
			);
			$result = $this->files->writeGcodeSibling($root, $model, $gcodeContent);
			return new JSONResponse($result);
		} catch (NotFoundException) {
			return new JSONResponse(['error' => 'not_found'], Http::STATUS_NOT_FOUND);
		} catch (\InvalidArgumentException $e) {
			return new JSONResponse(['error' => $e->getMessage()], Http::STATUS_BAD_REQUEST);
		} catch (\RuntimeException $e) {
			return new JSONResponse(['error' => $e->getMessage()], Http::STATUS_FORBIDDEN);
		} catch (\Throwable $e) {
			return new JSONResponse(['error' => 'save_failed'], Http::STATUS_INTERNAL_SERVER_ERROR);
		}
	}

	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function saveProject(): JSONResponse
	{
		if (!$this->access->canUseApp()) {
			return new JSONResponse($this->access->forbiddenJsonPayload(), Http::STATUS_FORBIDDEN);
		}

		$params = json_decode((string) file_get_contents('php://input'), true);
		if (!is_array($params)) {
			$params = $this->request->getParams();
		}
		$fileId = (int) ($params['file_id'] ?? 0);
		$davPath = (string) ($params['dav_path'] ?? '');
		$b64 = (string) ($params['project_base64'] ?? '');

		if ($b64 === '') {
			return new JSONResponse(['error' => 'project_required'], Http::STATUS_BAD_REQUEST);
		}
		$bytes = base64_decode($b64, true);
		if ($bytes === false) {
			return new JSONResponse(['error' => 'project_base64_invalid'], Http::STATUS_BAD_REQUEST);
		}
		if (strlen($bytes) > self::MAX_BYTES) {
			return new JSONResponse(['error' => 'project_too_large'], Http::STATUS_BAD_REQUEST);
		}
		if ($fileId <= 0 && $davPath === '') {
			return new JSONResponse(['error' => 'model_reference_required'], Http::STATUS_BAD_REQUEST);
		}

		try {
			$user = $this->access->requireUser();
			$root = $this->rootFolder->getUserFolder($user->getUID());
			$model = $this->files->resolveModelNode(
				$root,
				$davPath !== '' ? $davPath : null,
				$fileId > 0 ? $fileId : null,
			);
			$result = $this->files->writeProjectSibling($root, $model, $bytes);
			return new JSONResponse($result);
		} catch (NotFoundException) {
			return new JSONResponse(['error' => 'not_found'], Http::STATUS_NOT_FOUND);
		} catch (\InvalidArgumentException $e) {
			return new JSONResponse(['error' => $e->getMessage()], Http::STATUS_BAD_REQUEST);
		} catch (\RuntimeException $e) {
			return new JSONResponse(['error' => $e->getMessage()], Http::STATUS_FORBIDDEN);
		} catch (\Throwable $e) {
			return new JSONResponse(['error' => 'save_failed'], Http::STATUS_INTERNAL_SERVER_ERROR);
		}
	}

	/**
	 * @return array{0: int, 1: string, 2: string}
	 */
	private function parseRequestBody(): array
	{
		$uploaded = $this->request->getUploadedFile('gcode');
		if (is_array($uploaded) && ($uploaded['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_OK) {
			$fileId = (int) ($this->request->getParam('file_id') ?? 0);
			$davPath = (string) ($this->request->getParam('dav_path') ?? '');
			$tmp = (string) ($uploaded['tmp_name'] ?? '');
			if ($tmp === '' || !is_readable($tmp)) {
				throw new \InvalidArgumentException('upload_unreadable');
			}
			$content = file_get_contents($tmp);
			if ($content === false) {
				throw new \InvalidArgumentException('upload_read_failed');
			}
			return [$fileId, $davPath, $content];
		}

		$params = json_decode((string) file_get_contents('php://input'), true);
		if (!is_array($params)) {
			$params = $this->request->getParams();
		}

		$fileId = (int) ($params['file_id'] ?? 0);
		$davPath = (string) ($params['dav_path'] ?? '');

		$gcodeB64 = (string) ($params['gcode_base64'] ?? '');
		if ($gcodeB64 === '') {
			throw new \InvalidArgumentException('gcode_required');
		}

		$decoded = base64_decode($gcodeB64, true);
		if ($decoded === false) {
			throw new \InvalidArgumentException('gcode_base64_invalid');
		}

		return [$fileId, $davPath, $decoded];
	}
}
