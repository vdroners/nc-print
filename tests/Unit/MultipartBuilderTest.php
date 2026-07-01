<?php

declare(strict_types=1);

namespace OCA\NcPrint\Tests\Unit;

use OCA\NcPrint\Service\MultipartBuilder;
use PHPUnit\Framework\TestCase;

class MultipartBuilderTest extends TestCase
{
	public function testSliceMultipartContainsFields(): void
	{
		$built = MultipartBuilder::buildSliceMultipart(
			"solid",
			"cube.stl",
			"printer-1",
			["fil-a"],
			"proc-1",
			["layer_height" => 0.2],
		);
		$this->assertStringContainsString('name="model"', $built['body']);
		$this->assertStringContainsString('name="printer_id"', $built['body']);
		$this->assertStringContainsString('name="filament_ids"', $built['body']);
		$this->assertStringContainsString('name="process_id"', $built['body']);
		$this->assertStringContainsString('name="overrides"', $built['body']);
		$this->assertStringStartsWith('multipart/form-data; boundary=', $built['contentType']);
	}

	public function testMoonrakerUploadPrintField(): void
	{
		$built = MultipartBuilder::buildMoonrakerUpload("G1", "job.gcode", true);
		$this->assertStringContainsString('name="file"', $built['body']);
		$this->assertStringContainsString('name="print"', $built['body']);
		$this->assertStringContainsString("true", $built['body']);
	}
}
