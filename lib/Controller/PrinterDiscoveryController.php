<?php

declare(strict_types=1);

namespace OCA\NcPrint\Controller;

use OCA\NcPrint\AppInfo\Application;
use OCA\NcPrint\Service\AccessService;
use OCA\NcPrint\Service\ConfigService;
use OCA\NcPrint\Service\PrinterDiscoveryService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IConfig;
use OCP\IRequest;

/**
 * In-app printer discovery for the printer picker.
 *
 * Same Moonraker LAN sweep as the admin settings page, but access-gated to the
 * configured groups (not admin-only) so operators can find printers from the
 * main app. Read-only: it probes and returns candidates; it does NOT write the
 * multi_printers config (that stays an admin action).
 */
class PrinterDiscoveryController extends Controller
{
	public function __construct(
		IRequest $request,
		private IConfig $config,
		private AccessService $access,
		private PrinterDiscoveryService $discovery,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	#[NoCSRFRequired]
	#[NoAdminRequired]
	public function discover(): JSONResponse
	{
		if (!$this->access->canUseApp()) {
			return new JSONResponse($this->access->forbiddenJsonPayload(), Http::STATUS_FORBIDDEN);
		}
		$params = $this->request->getParams();
		$configured = (string) $this->config->getAppValue(
			Application::APP_ID,
			ConfigService::KEY_MOONRAKER_INTERNAL_URL,
			ConfigService::DEFAULT_MOONRAKER_INTERNAL_URL,
		);
		$found = $this->discovery->discover($params, $configured);
		return new JSONResponse(['ok' => true, 'printers' => $found]);
	}
}
