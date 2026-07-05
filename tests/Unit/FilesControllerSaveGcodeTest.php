<?php

declare(strict_types=1);

namespace OCA\NcPrint\Tests\Unit;

use OCA\NcPrint\Controller\FilesController;
use OCA\NcPrint\Controller\GcodeSaveController;
use OCA\NcPrint\Service\AccessService;
use OCA\NcPrint\Service\FileFetchService;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\JSONResponse;
use OCP\Files\IRootFolder;
use OCP\IRequest;
use PHPUnit\Framework\TestCase;

class FilesControllerSaveGcodeTest extends TestCase
{
	public function testSaveGcodeDelegatesWithRootFolder(): void
	{
		$access = $this->createMock(AccessService::class);
		$access->method('canUseApp')->willReturn(false);
		$access->method('forbiddenJsonPayload')->willReturn(['error' => 'forbidden']);

		$request = $this->createMock(IRequest::class);
		$files = $this->createMock(FileFetchService::class);
		$root = $this->createMock(IRootFolder::class);

		$controller = new FilesController($request, $access, $files, $root);
		$response = $controller->saveGcode();

		$this->assertInstanceOf(JSONResponse::class, $response);
		$this->assertSame(Http::STATUS_FORBIDDEN, $response->getStatus());

		// Sanity: direct GcodeSaveController with four args still constructs.
		$direct = new GcodeSaveController($request, $access, $files, $root);
		$this->assertInstanceOf(GcodeSaveController::class, $direct);
	}
}
