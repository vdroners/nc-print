<?php

declare(strict_types=1);

namespace OCA\NcPrint\Controller;

use OCA\NcPrint\AppInfo\Application;
use OCA\NcPrint\Service\AccessService;
use OCA\NcPrint\Service\ConfigService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IRequest;
use OCP\ISession;

/**
 * Issues short-lived poll-mode tickets stored in the PHP session. The Vue
 * client uses these when opening a Moonraker WebSocket through the cloud host.
 */
class WsTicketController extends Controller
{
	private const TICKET_TTL_SECONDS = 60;
	private const SESSION_KEY = 'nc_print_ws_tickets';

	public function __construct(
		IRequest $request,
		private AccessService $access,
		private ConfigService $config,
		private ISession $session,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	#[NoCSRFRequired]
	#[NoAdminRequired]
	public function issue(): JSONResponse
	{
		if (!$this->config->isMoonrakerEnabled()) {
			return new JSONResponse(
				['error' => 'feature_disabled'],
				Http::STATUS_SERVICE_UNAVAILABLE,
			);
		}

		if (!$this->access->canUseApp()) {
			return new JSONResponse(
				$this->access->forbiddenJsonPayload(),
				Http::STATUS_FORBIDDEN,
			);
		}

		$user = $this->access->requireUser();
		$this->purgeExpiredTickets();

		try {
			$nonce = bin2hex(random_bytes(16));
		} catch (\Exception) {
			return new JSONResponse(
				['error' => 'nonce_unavailable'],
				Http::STATUS_INTERNAL_SERVER_ERROR,
			);
		}

		$exp = time() + self::TICKET_TTL_SECONDS;
		$ticket = $user->getUID() . ':' . $exp . ':' . $nonce;
		$stored = $this->session->get(self::SESSION_KEY);
		if (!is_array($stored)) {
			$stored = [];
		}
		$stored[$ticket] = [
			'uid' => $user->getUID(),
			'mode' => 'poll',
			'exp' => $exp,
		];
		$this->session->set(self::SESSION_KEY, $stored);

		return new JSONResponse([
			'ticket' => $ticket,
			'mode' => 'poll',
			'expires_in' => self::TICKET_TTL_SECONDS,
		]);
	}

	private function purgeExpiredTickets(): void
	{
		$stored = $this->session->get(self::SESSION_KEY);
		if (!is_array($stored)) {
			return;
		}
		$now = time();
		foreach ($stored as $ticket => $meta) {
			if (!is_array($meta) || (int) ($meta['exp'] ?? 0) < $now) {
				unset($stored[$ticket]);
			}
		}
		$this->session->set(self::SESSION_KEY, $stored);
	}
}
