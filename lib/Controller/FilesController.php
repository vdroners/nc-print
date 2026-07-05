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
use OCP\AppFramework\Http\DataDownloadResponse;
use OCP\AppFramework\Http\JSONResponse;
use OCP\AppFramework\Http\Response;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use OCP\IRequest;

class FilesController extends Controller
{
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
	public function resolve(): JSONResponse
	{
		if (!$this->access->canUseApp()) {
			return new JSONResponse($this->access->forbiddenJsonPayload(), Http::STATUS_FORBIDDEN);
		}

		$params = json_decode((string) file_get_contents('php://input'), true);
		if (!is_array($params)) {
			$params = $this->request->getParams();
		}

		try {
			$user = $this->access->requireUser();
			$root = $this->rootFolder->getUserFolder($user->getUID());
			$fileId = (int) ($params['file_id'] ?? 0);
			$davPath = (string) ($params['dav_path'] ?? '');
			$allowGcode = !empty($params['allow_gcode']);
			$file = $this->files->resolveNode(
				$root,
				$davPath !== '' ? $davPath : null,
				$fileId > 0 ? $fileId : null,
				$allowGcode,
			);
			return new JSONResponse($this->files->describeFile($root, $file));
		} catch (NotFoundException) {
			return new JSONResponse(['error' => 'not_found'], Http::STATUS_NOT_FOUND);
		} catch (\InvalidArgumentException $e) {
			return new JSONResponse(['error' => $e->getMessage()], Http::STATUS_BAD_REQUEST);
		} catch (\Throwable $e) {
			return new JSONResponse(['error' => 'resolve_failed'], Http::STATUS_INTERNAL_SERVER_ERROR);
		}
	}

	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function fetch(): Http\Response
	{
		if (!$this->access->canUseApp()) {
			return new JSONResponse($this->access->forbiddenJsonPayload(), Http::STATUS_FORBIDDEN);
		}

		$params = json_decode((string) file_get_contents('php://input'), true);
		if (!is_array($params)) {
			$params = $this->request->getParams();
		}

		try {
			$user = $this->access->requireUser();
			$root = $this->rootFolder->getUserFolder($user->getUID());
			$fileId = (int) ($params['file_id'] ?? 0);
			$davPath = (string) ($params['dav_path'] ?? '');
			$allowGcode = !empty($params['allow_gcode']);
			$file = $this->files->resolveNode(
				$root,
				$davPath !== '' ? $davPath : null,
				$fileId > 0 ? $fileId : null,
				$allowGcode,
			);
			$content = $this->files->readFileContents($file);
			$mime = $file->getMimeType() ?: 'application/octet-stream';

			return new DataDownloadResponse($content, $file->getName(), $mime);
		} catch (NotFoundException) {
			return new JSONResponse(['error' => 'not_found'], Http::STATUS_NOT_FOUND);
		} catch (\InvalidArgumentException $e) {
			return new JSONResponse(['error' => $e->getMessage()], Http::STATUS_BAD_REQUEST);
		} catch (\Throwable $e) {
			return new JSONResponse(['error' => 'fetch_failed'], Http::STATUS_INTERNAL_SERVER_ERROR);
		}
	}

	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function saveGcode(): Http\Response
	{
		$controller = new GcodeSaveController($this->request, $this->access, $this->files);
		return $controller->saveGcode();
	}
}
