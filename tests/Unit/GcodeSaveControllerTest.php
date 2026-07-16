<?php

declare(strict_types=1);

namespace OCA\NcPrint\Tests\Unit;

use OCA\NcPrint\Controller\GcodeSaveController;
use OCA\NcPrint\Service\AccessService;
use OCA\NcPrint\Service\FileFetchService;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\JSONResponse;
use OCP\Files\IRootFolder;
use OCP\IRequest;
use PHPUnit\Framework\TestCase;

class GcodeSaveControllerTest extends TestCase
{
	private function makeController(
		AccessService $access,
		?IRequest $request = null,
		?FileFetchService $files = null,
	): GcodeSaveController {
		return new GcodeSaveController(
			$request ?? $this->createMock(IRequest::class),
			$access,
			$files ?? $this->createMock(FileFetchService::class),
			$this->createMock(IRootFolder::class),
		);
	}

	public function testForbiddenWhenNoAccess(): void
	{
		$access = $this->createMock(AccessService::class);
		$access->method('canUseApp')->willReturn(false);
		$access->method('forbiddenJsonPayload')->willReturn(['error' => 'forbidden']);

		$response = $this->makeController($access)->saveGcode();
		$this->assertInstanceOf(JSONResponse::class, $response);
		$this->assertSame(Http::STATUS_FORBIDDEN, $response->getStatus());
	}

	public function testBadRequestWhenGcodeMissing(): void
	{
		$access = $this->createMock(AccessService::class);
		$access->method('canUseApp')->willReturn(true);

		$request = $this->createMock(IRequest::class);
		$request->method('getUploadedFile')->willReturn(null);
		$request->method('getParams')->willReturn([
			'file_id' => 42,
			'gcode_base64' => '',
		]);

		$response = $this->makeController($access, $request)->saveGcode();
		$this->assertSame(Http::STATUS_BAD_REQUEST, $response->getStatus());
		$data = $response->getData();
		$this->assertSame('gcode_required', $data['error']);
	}

	public function testBadRequestWhenModelReferenceMissing(): void
	{
		$access = $this->createMock(AccessService::class);
		$access->method('canUseApp')->willReturn(true);

		$request = $this->createMock(IRequest::class);
		$request->method('getUploadedFile')->willReturn(null);
		$request->method('getParams')->willReturn([
			'gcode_base64' => base64_encode("G28\n"),
		]);

		$response = $this->makeController($access, $request)->saveGcode();
		$this->assertSame(Http::STATUS_BAD_REQUEST, $response->getStatus());
		$data = $response->getData();
		$this->assertSame('model_reference_required', $data['error']);
	}

	public function testBadRequestWhenBase64Invalid(): void
	{
		$access = $this->createMock(AccessService::class);
		$access->method('canUseApp')->willReturn(true);

		$request = $this->createMock(IRequest::class);
		$request->method('getUploadedFile')->willReturn(null);
		$request->method('getParams')->willReturn([
			'file_id' => 7,
			'gcode_base64' => '%%%not-base64%%%',
		]);

		$response = $this->makeController($access, $request)->saveGcode();
		$this->assertSame(Http::STATUS_BAD_REQUEST, $response->getStatus());
		$data = $response->getData();
		$this->assertSame('gcode_base64_invalid', $data['error']);
	}

	public function testSaveProjectForbiddenWhenNoAccess(): void
	{
		$access = $this->createMock(AccessService::class);
		$access->method('canUseApp')->willReturn(false);
		$access->method('forbiddenJsonPayload')->willReturn(['error' => 'forbidden']);

		$response = $this->makeController($access)->saveProject();
		$this->assertSame(Http::STATUS_FORBIDDEN, $response->getStatus());
	}

	public function testSaveProjectRequiresProjectBytes(): void
	{
		$access = $this->createMock(AccessService::class);
		$access->method('canUseApp')->willReturn(true);

		$request = $this->createMock(IRequest::class);
		$request->method('getParams')->willReturn(['file_id' => 5]);

		$response = $this->makeController($access, $request)->saveProject();
		$this->assertSame(Http::STATUS_BAD_REQUEST, $response->getStatus());
		$this->assertSame('project_required', $response->getData()['error']);
	}

	public function testSaveProjectRejectsInvalidBase64(): void
	{
		$access = $this->createMock(AccessService::class);
		$access->method('canUseApp')->willReturn(true);

		$request = $this->createMock(IRequest::class);
		$request->method('getParams')->willReturn([
			'file_id' => 5,
			'project_base64' => '%%%bad%%%',
		]);

		$response = $this->makeController($access, $request)->saveProject();
		$this->assertSame(Http::STATUS_BAD_REQUEST, $response->getStatus());
		$this->assertSame('project_base64_invalid', $response->getData()['error']);
	}

	public function testSaveProjectRequiresModelReference(): void
	{
		$access = $this->createMock(AccessService::class);
		$access->method('canUseApp')->willReturn(true);

		$request = $this->createMock(IRequest::class);
		$request->method('getParams')->willReturn([
			'project_base64' => base64_encode('PK-fake-3mf'),
		]);

		$response = $this->makeController($access, $request)->saveProject();
		$this->assertSame(Http::STATUS_BAD_REQUEST, $response->getStatus());
		$this->assertSame('model_reference_required', $response->getData()['error']);
	}
}
