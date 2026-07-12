<?php

declare(strict_types=1);

namespace OCA\NcPrint\Db;

use JsonSerializable;
use OCP\AppFramework\Db\Entity;

/**
 * One maintenance action on a printer component. `hours_at` is the printer's
 * cumulative print-hours reading at the time of the action (nullable — snapshot
 * from the wear() heuristic when omitted); `at` is a unix-second bigint to match
 * the print-history / spool tables. `cost` is an optional float.
 *
 * @method string getUid()
 * @method void setUid(string $uid)
 * @method string getPrinterId()
 * @method void setPrinterId(string $printerId)
 * @method string getComponent()
 * @method void setComponent(string $component)
 * @method string getAction()
 * @method void setAction(string $action)
 * @method float|null getHoursAt()
 * @method void setHoursAt(?float $hoursAt)
 * @method float|null getCost()
 * @method void setCost(?float $cost)
 * @method string|null getNotes()
 * @method void setNotes(?string $notes)
 * @method int getAt()
 * @method void setAt(int $at)
 */
class MaintenanceRecord extends Entity implements JsonSerializable
{
	protected $uid;
	protected $printerId;
	protected $component;
	protected $action;
	protected $hoursAt;
	protected $cost;
	protected $notes;
	protected $at;

	public function __construct()
	{
		$this->addType('hoursAt', 'float');
		$this->addType('cost', 'float');
		$this->addType('at', 'integer');
	}

	public function jsonSerialize(): array
	{
		return [
			'id' => (int) $this->id,
			'printer_id' => $this->printerId,
			'component' => $this->component,
			'action' => $this->action,
			'hours_at' => $this->hoursAt,
			'cost' => $this->cost,
			'notes' => $this->notes,
			'at' => (int) $this->at,
		];
	}
}
