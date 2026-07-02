<?php

declare(strict_types=1);

namespace OCA\NcPrint\Controller;

use OCA\NcPrint\AppInfo\Application;
use OCA\NcPrint\Service\ConfigService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\AdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IConfig;
use OCP\IRequest;

class AdminController extends Controller
{
	public function __construct(
		IRequest $request,
		private IConfig $config,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	#[AdminRequired]
	#[NoCSRFRequired]
	public function saveSettings(): JSONResponse
	{
		$params = $this->request->getParams();

		$stringKeys = [
			ConfigService::KEY_SLICER_INTERNAL_URL,
			ConfigService::KEY_MOONRAKER_INTERNAL_URL,
			ConfigService::KEY_MOONRAKER_CAMERA_URL,
			ConfigService::KEY_PRINTER_DISPLAY_NAME,
			ConfigService::KEY_ALLOWED_GROUPS,
			ConfigService::KEY_MULTI_PRINTERS,
		];
		foreach ($stringKeys as $key) {
			if (array_key_exists($key, $params)) {
				$this->config->setAppValue(
					Application::APP_ID,
					$key,
					trim((string) $params[$key]),
				);
			}
		}

		foreach ([ConfigService::KEY_SLICER_ENABLED, ConfigService::KEY_MOONRAKER_ENABLED, ConfigService::KEY_CONSOLE_ENABLED] as $boolKey) {
			if (array_key_exists($boolKey, $params)) {
				$raw = $params[$boolKey];
				$enabled = ($raw === true || $raw === 1 || $raw === '1'
					|| (is_string($raw) && in_array(strtolower($raw), ['true', 'yes', 'on'], true)));
				$this->config->setAppValue(
					Application::APP_ID,
					$boolKey,
					$enabled ? 'yes' : 'no',
				);
			}
		}

		return new JSONResponse(['ok' => true]);
	}
}
