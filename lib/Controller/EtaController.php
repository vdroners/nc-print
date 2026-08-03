<?php

declare(strict_types=1);

namespace OCA\NcPrint\Controller;

use OCA\NcPrint\AppInfo\Application;
use OCA\NcPrint\Service\AccessService;
use OCA\NcPrint\Service\EtaLearningService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IRequest;

/**
 * Smart ETA endpoints: predict an adjusted print duration from the slicer
 * estimate + learned history, and record a completed print to refine the model.
 *
 * All learning state lives in app-config via EtaLearningService (no printer
 * round-trip, no schema). Access is gated to the configured groups like the
 * rest of the app.
 */
class EtaController extends Controller
{
	public function __construct(
		IRequest $request,
		private AccessService $access,
		private EtaLearningService $eta,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	#[NoAdminRequired]
	public function predict(): JSONResponse
	{
		if (!$this->access->canUseApp()) {
			return new JSONResponse($this->access->forbiddenJsonPayload(), Http::STATUS_FORBIDDEN);
		}
		$params = $this->mergedParams();
		$slicerMinutes = $this->floatParam($params, 'slicer_minutes');
		if ($slicerMinutes === null) {
			return new JSONResponse(
				['error' => 'missing_estimate', 'message' => 'slicer_minutes is required'],
				Http::STATUS_BAD_REQUEST,
			);
		}
		return new JSONResponse($this->eta->predict($slicerMinutes, $this->ctxFromParams($params)));
	}

	#[NoAdminRequired]
	public function record(): JSONResponse
	{
		if (!$this->access->canUseApp()) {
			return new JSONResponse($this->access->forbiddenJsonPayload(), Http::STATUS_FORBIDDEN);
		}
		$params = $this->mergedParams();
		$slicerMinutes = $this->floatParam($params, 'slicer_minutes');
		$actualMinutes = $this->floatParam($params, 'actual_minutes');
		if ($slicerMinutes === null || $actualMinutes === null) {
			return new JSONResponse(
				['error' => 'missing_estimate', 'message' => 'slicer_minutes and actual_minutes are required'],
				Http::STATUS_BAD_REQUEST,
			);
		}
		$updated = $this->eta->recordCompletion($this->ctxFromParams($params), $slicerMinutes, $actualMinutes);
		if ($updated === null) {
			// Not an error — the sample was out of the sanity band or lacked a
			// printer id, so it was intentionally skipped.
			return new JSONResponse(['ok' => true, 'recorded' => false]);
		}
		return new JSONResponse(['ok' => true, 'recorded' => true, 'bucket' => $updated]);
	}

	#[NoCSRFRequired]
	#[NoAdminRequired]
	public function stats(): JSONResponse
	{
		if (!$this->access->canUseApp()) {
			return new JSONResponse($this->access->forbiddenJsonPayload(), Http::STATUS_FORBIDDEN);
		}
		$printerId = (string) ($this->request->getParam('printer_id', ''));
		return new JSONResponse(['buckets' => $this->eta->listForPrinter($printerId)]);
	}

	private function ctxFromParams(array $params): array
	{
		return [
			'printerId' => (string) ($params['printer_id'] ?? ''),
			'material' => $params['material'] ?? null,
			'nozzleDiameter' => $params['nozzle_diameter'] ?? null,
		];
	}

	private function floatParam(array $params, string $key): ?float
	{
		if (!array_key_exists($key, $params) || $params[$key] === '' || $params[$key] === null) {
			return null;
		}
		if (!is_numeric($params[$key])) {
			return null;
		}
		return (float) $params[$key];
	}

	private function mergedParams(): array
	{
		$params = $this->request->getParams();
		$raw = file_get_contents('php://input');
		if (is_string($raw) && $raw !== '') {
			$json = json_decode($raw, true);
			if (is_array($json)) {
				$params = array_merge($params, $json);
			}
		}
		return $params;
	}
}
