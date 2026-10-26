<?php

declare(strict_types=1);

namespace OCA\NcPrint\Tests\Unit;

use OCA\NcPrint\Service\OutboundWebhookService;
use PHPUnit\Framework\TestCase;

class OutboundWebhookServiceTest extends TestCase
{
	public function testBuildAndVerifySignature(): void
	{
		$secret = 'test-secret-abc';
		$built = OutboundWebhookService::buildSignedPayload(
			'print_started',
			'Print Started',
			'Door.gcode',
			['printer_id' => 'k1-max', 'filename' => 'Door.gcode'],
			$secret,
		);
		$this->assertStringStartsWith('sha256=', $built['signature']);
		$this->assertTrue(
			OutboundWebhookService::verifySignature($built['body'], $built['signature'], $secret),
		);
		$this->assertFalse(
			OutboundWebhookService::verifySignature($built['body'], $built['signature'], 'wrong'),
		);
		$body = json_decode($built['body'], true);
		$this->assertSame('nc_print', $body['source']);
		$this->assertSame('print_started', $body['event']);
	}

	public function testEventForTransition(): void
	{
		$this->assertSame('print_finished', OutboundWebhookService::eventForTransition('complete'));
		$this->assertSame('print_failed', OutboundWebhookService::eventForTransition('error'));
		$this->assertSame('print_started', OutboundWebhookService::eventForTransition('started'));
		$this->assertNull(OutboundWebhookService::eventForTransition('nope'));
	}
}
