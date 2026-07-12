<?php

declare(strict_types=1);

namespace OCA\NcPrint\Service;

use Psr\Log\LoggerInterface;

/**
 * Per-Nextcloud-user achievements, derived on demand from the user's print
 * history (via PrintHistoryService::metrics). No dedicated table — an achievement
 * is "earned" purely as a function of the current aggregates, so there is nothing
 * to migrate or keep in sync. Adapted from 3DPrintForge's milestone catalogue,
 * trimmed to the metrics nc-print actually tracks.
 *
 * Every read is best-effort: a metrics failure yields an all-locked list rather
 * than surfacing an error, matching the rest of the history subsystem.
 */
class AchievementService
{
	public function __construct(
		private PrintHistoryService $history,
		private LoggerInterface $logger,
	) {
	}

	/**
	 * @return array{achievements:list<array>,summary:array{earned:int,total:int,xp:int,xp_total:int}}
	 */
	public function list(string $uid): array
	{
		$m = [];
		try {
			$m = $this->history->metrics($uid);
		} catch (\Throwable $e) {
			$this->logger->warning('nc_print achievements: metrics failed', ['exception' => $e]);
		}
		$overall = $m['overall'] ?? [];
		$byPrinter = $m['by_printer'] ?? [];

		$complete = (int) ($overall['complete'] ?? 0);
		$total = (int) ($overall['total'] ?? 0);
		$filamentG = (float) ($overall['filament_g'] ?? 0);
		$hours = (float) ($overall['print_hours'] ?? 0);
		$successRate = $overall['success_rate'] !== null ? (float) $overall['success_rate'] : 0.0;

		// Distinct materials + printers across the fleet.
		$materials = [];
		$printers = 0;
		foreach ($byPrinter as $p) {
			$printers++;
			foreach (($p['materials'] ?? []) as $mat => $_cnt) {
				$materials[$mat] = true;
			}
		}
		$materialCount = count($materials);
		$filamentKg = $filamentG / 1000.0;

		$defs = [
			// [id, icon, title, desc, category, current, target, xp]
			['first_print', '🎉', 'First print', 'Complete your first print', 'prints', $complete, 1, 50],
			['prints_10', '🔟', 'Getting going', 'Complete 10 prints', 'prints', $complete, 10, 100],
			['prints_50', '⚙️', 'Regular maker', 'Complete 50 prints', 'prints', $complete, 50, 200],
			['prints_100', '💯', 'Century', 'Complete 100 prints', 'prints', $complete, 100, 400],
			['prints_500', '🏭', 'Print farm', 'Complete 500 prints', 'prints', $complete, 500, 1000],

			['filament_1kg', '🧵', 'First kilo', 'Use 1 kg of filament', 'filament', $filamentKg, 1, 100],
			['filament_10kg', '📦', 'Bulk buyer', 'Use 10 kg of filament', 'filament', $filamentKg, 10, 300],
			['filament_50kg', '🚚', 'Filament fiend', 'Use 50 kg of filament', 'filament', $filamentKg, 50, 800],

			['materials_3', '🌈', 'Material explorer', 'Print in 3 different materials', 'exploration', $materialCount, 3, 150],
			['materials_6', '🧪', 'Material scientist', 'Print in 6 different materials', 'exploration', $materialCount, 6, 350],

			['printers_2', '🖨️', 'Two-machine shop', 'Print on 2 different printers', 'exploration', $printers, 2, 150],
			['printers_5', '🏢', 'Fleet operator', 'Print on 5 different printers', 'exploration', $printers, 5, 500],

			['hours_24', '⏱️', 'A full day', 'Rack up 24 print-hours', 'time', $hours, 24, 150],
			['hours_100', '🕰️', 'Marathoner', 'Rack up 100 print-hours', 'time', $hours, 100, 400],
			['hours_500', '🌌', 'Time lord', 'Rack up 500 print-hours', 'time', $hours, 500, 1000],
		];

		$achievements = [];
		$earned = 0;
		$xp = 0;
		$xpTotal = 0;
		foreach ($defs as [$id, $icon, $title, $desc, $cat, $current, $target, $awardXp]) {
			$cur = (float) $current;
			$tgt = (float) $target;
			$done = $tgt > 0 && $cur >= $tgt;
			$progress = $tgt > 0 ? min(1.0, round($cur / $tgt, 3)) : 0.0;
			$xpTotal += $awardXp;
			if ($done) {
				$earned++;
				$xp += $awardXp;
			}
			$achievements[] = [
				'id' => $id,
				'icon' => $icon,
				'title' => $title,
				'description' => $desc,
				'category' => $cat,
				'current' => round($cur, 2),
				'target' => $target,
				'earned' => $done,
				'progress' => $progress,
				'xp' => $awardXp,
			];
		}

		// Success-rate achievements only count once the user has enough prints
		// for the rate to be meaningful.
		if ($total >= 20) {
			$rateDefs = [
				['success_95', '🎯', 'Sharp shooter', '95% success rate (20+ prints)', 0.95, 400],
				['success_99', '🏆', 'Flawless', '99% success rate (20+ prints)', 0.99, 900],
			];
			foreach ($rateDefs as [$id, $icon, $title, $desc, $tgt, $awardXp]) {
				$done = $successRate >= $tgt;
				$xpTotal += $awardXp;
				if ($done) {
					$earned++;
					$xp += $awardXp;
				}
				$achievements[] = [
					'id' => $id,
					'icon' => $icon,
					'title' => $title,
					'description' => $desc,
					'category' => 'quality',
					'current' => round($successRate, 3),
					'target' => $tgt,
					'earned' => $done,
					'progress' => min(1.0, round($successRate / $tgt, 3)),
					'xp' => $awardXp,
				];
			}
		}

		return [
			'achievements' => $achievements,
			'summary' => [
				'earned' => $earned,
				'total' => count($achievements),
				'xp' => $xp,
				'xp_total' => $xpTotal,
			],
		];
	}
}
