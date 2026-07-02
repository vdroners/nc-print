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
use OCP\AppFramework\Http\TemplateResponse;
use OCP\IConfig;
use OCP\IRequest;
use OCP\IURLGenerator;
use OCP\Util;

class PageController extends Controller
{
	public function __construct(
		IRequest $request,
		private IConfig $config,
		private ConfigService $configService,
		private AccessService $access,
		private IURLGenerator $urlGenerator,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function index(): TemplateResponse
	{
		if (!$this->access->canUseApp()) {
			return new TemplateResponse(
				'core',
				'403',
				['message' => AccessService::FORBIDDEN_MESSAGE],
				TemplateResponse::RENDER_AS_ERROR,
				Http::STATUS_FORBIDDEN,
			);
		}

		Util::addScript(Application::APP_ID, 'nc_print-main');
		// nc-print-theme.css (design tokens + app-shell base) is added globally
		// in Application::boot(); style.css holds the app's component/layout
		// rules (built from css/style.scss) and must be enqueued for the app
		// page or the workflow bar, viewport toolbar, etc. render unstyled.
		Util::addStyle(Application::APP_ID, 'style');

		$fileId = (int) $this->request->getParam('fileId', 0);
		$openTab = (string) $this->request->getParam('tab', '');
		$version = $this->config->getAppValue(
			Application::APP_ID,
			'installed_version',
			'1.0.0',
		);
		$bootstrap = array_merge(
			$this->configService->publicBootstrap(),
			[
				'route_base' => rtrim(
					$this->urlGenerator->linkToRoute('nc_print.page.index'),
					'/',
				),
				'app_version' => $version,
				'file_id' => $fileId > 0 ? $fileId : null,
				'open_tab' => in_array($openTab, ['prepare', 'slice', 'print'], true) ? $openTab : null,
			],
		);

		return new TemplateResponse(Application::APP_ID, 'main', [
			'bootstrap_json' => json_encode(
				$bootstrap,
				JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES,
			),
			'app_version' => $version,
		]);
	}
}
