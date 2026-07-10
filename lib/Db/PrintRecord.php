<?php

declare(strict_types=1);

namespace OCA\NcPrint\Db;

use JsonSerializable;
use OCP\AppFramework\Db\Entity;

/**
 * One terminated print. Timestamps are unix seconds (bigint columns) so they
 * aggregate cleanly across sqlite/mysql/pgsql. Nullable numeric fields (slicer
 * estimate, filament grams/mm, layer height) are best-effort from the slice
 * context and may be absent for prints that weren't sliced through this app.
 *
 * @method string getUid()
 * @method void setUid(string $uid)
 * @method string getPrinterId()
 * @method void setPrinterId(string $printerId)
 * @method string|null getPrinterName()
 * @method void setPrinterName(?string $printerName)
 * @method string getFilename()
 * @method void setFilename(string $filename)
 * @method string|null getMaterial()
 * @method void setMaterial(?string $material)
 * @method float|null getNozzleDiameter()
 * @method void setNozzleDiameter(?float $nozzleDiameter)
 * @method string getResult()
 * @method void setResult(string $result)
 * @method string|null getFailureReason()
 * @method void setFailureReason(?string $failureReason)
 * @method int|null getStartedAt()
 * @method void setStartedAt(?int $startedAt)
 * @method int getEndedAt()
 * @method void setEndedAt(int $endedAt)
 * @method int getDurationS()
 * @method void setDurationS(int $durationS)
 * @method int|null getSlicerDurationS()
 * @method void setSlicerDurationS(?int $slicerDurationS)
 * @method float|null getFilamentG()
 * @method void setFilamentG(?float $filamentG)
 * @method float|null getFilamentMm()
 * @method void setFilamentMm(?float $filamentMm)
 * @method float|null getLayerHeight()
 * @method void setLayerHeight(?float $layerHeight)
 * @method int getCreatedAt()
 * @method void setCreatedAt(int $createdAt)
 */
class PrintRecord extends Entity implements JsonSerializable
{
	protected $uid;
	protected $printerId;
	protected $printerName;
	protected $filename;
	protected $material;
	protected $nozzleDiameter;
	protected $result;
	protected $failureReason;
	protected $startedAt;
	protected $endedAt;
	protected $durationS;
	protected $slicerDurationS;
	protected $filamentG;
	protected $filamentMm;
	protected $layerHeight;
	protected $createdAt;

	public function __construct()
	{
		$this->addType('nozzleDiameter', 'float');
		$this->addType('startedAt', 'integer');
		$this->addType('endedAt', 'integer');
		$this->addType('durationS', 'integer');
		$this->addType('slicerDurationS', 'integer');
		$this->addType('filamentG', 'float');
		$this->addType('filamentMm', 'float');
		$this->addType('layerHeight', 'float');
		$this->addType('createdAt', 'integer');
	}

	public function jsonSerialize(): array
	{
		// eta_ratio = actual / slicer, when both present and sane.
		$etaRatio = null;
		if ($this->slicerDurationS !== null && (int) $this->slicerDurationS > 0 && (int) $this->durationS > 0) {
			$etaRatio = round((float) $this->durationS / (float) $this->slicerDurationS, 3);
		}

		return [
			'id' => (int) $this->id,
			'printer_id' => $this->printerId,
			'printer_name' => $this->printerName,
			'filename' => $this->filename,
			'material' => $this->material,
			'nozzle_diameter' => $this->nozzleDiameter,
			'result' => $this->result,
			'failure_reason' => $this->failureReason,
			'started_at' => $this->startedAt !== null ? (int) $this->startedAt : null,
			'ended_at' => (int) $this->endedAt,
			'duration_s' => (int) $this->durationS,
			'slicer_duration_s' => $this->slicerDurationS !== null ? (int) $this->slicerDurationS : null,
			'eta_ratio' => $etaRatio,
			'filament_g' => $this->filamentG,
			'filament_mm' => $this->filamentMm,
			'layer_height' => $this->layerHeight,
			'created_at' => (int) $this->createdAt,
		];
	}
}
