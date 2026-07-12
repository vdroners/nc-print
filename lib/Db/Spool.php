<?php

declare(strict_types=1);

namespace OCA\NcPrint\Db;

use JsonSerializable;
use OCP\AppFramework\Db\Entity;

/**
 * One physical filament spool in a user's inventory. Weights are grams (float);
 * cost is optional with a free-form currency tag. Timestamps are unix seconds
 * (bigint columns) to match the print-history table. `archived` is a 0/1 bool.
 *
 * jsonSerialize() emits snake_case keys plus two computed fields: `remaining_pct`
 * (remaining / total, rounded, divide-by-zero guarded) and `low_stock`
 * (remaining_pct < 15).
 *
 * @method string getUid()
 * @method void setUid(string $uid)
 * @method string getBrand()
 * @method void setBrand(string $brand)
 * @method string getMaterial()
 * @method void setMaterial(string $material)
 * @method string|null getColorName()
 * @method void setColorName(?string $colorName)
 * @method string|null getColorHex()
 * @method void setColorHex(?string $colorHex)
 * @method float|null getDiameter()
 * @method void setDiameter(?float $diameter)
 * @method float getWeightTotalG()
 * @method void setWeightTotalG(float $weightTotalG)
 * @method float getWeightRemainingG()
 * @method void setWeightRemainingG(float $weightRemainingG)
 * @method float|null getCost()
 * @method void setCost(?float $cost)
 * @method string|null getCurrency()
 * @method void setCurrency(?string $currency)
 * @method string|null getLocation()
 * @method void setLocation(?string $location)
 * @method string|null getNotes()
 * @method void setNotes(?string $notes)
 * @method int getArchived()
 * @method void setArchived(int $archived)
 * @method int getCreatedAt()
 * @method void setCreatedAt(int $createdAt)
 * @method int getUpdatedAt()
 * @method void setUpdatedAt(int $updatedAt)
 */
class Spool extends Entity implements JsonSerializable
{
	protected $uid;
	protected $brand;
	protected $material;
	protected $colorName;
	protected $colorHex;
	protected $diameter;
	protected $weightTotalG;
	protected $weightRemainingG;
	protected $cost;
	protected $currency;
	protected $location;
	protected $notes;
	protected $archived;
	protected $createdAt;
	protected $updatedAt;

	public function __construct()
	{
		$this->addType('diameter', 'float');
		$this->addType('weightTotalG', 'float');
		$this->addType('weightRemainingG', 'float');
		$this->addType('cost', 'float');
		$this->addType('archived', 'integer');
		$this->addType('createdAt', 'integer');
		$this->addType('updatedAt', 'integer');
	}

	public function jsonSerialize(): array
	{
		// remaining_pct = remaining / total * 100, guarding divide-by-zero.
		$total = (float) $this->weightTotalG;
		$remaining = (float) $this->weightRemainingG;
		$remainingPct = $total > 0 ? (int) round($remaining / $total * 100) : 0;

		return [
			'id' => (int) $this->id,
			'uid' => $this->uid,
			'brand' => $this->brand,
			'material' => $this->material,
			'color_name' => $this->colorName,
			'color_hex' => $this->colorHex,
			'diameter' => $this->diameter,
			'weight_total_g' => (float) $this->weightTotalG,
			'weight_remaining_g' => (float) $this->weightRemainingG,
			'cost' => $this->cost,
			'currency' => $this->currency,
			'location' => $this->location,
			'notes' => $this->notes,
			'archived' => (int) $this->archived,
			'created_at' => (int) $this->createdAt,
			'updated_at' => (int) $this->updatedAt,
			'remaining_pct' => $remainingPct,
			'low_stock' => $remainingPct < 15,
		];
	}
}
