<?php
/** @var array $_ */
use OCA\NcPrint\Service\ConfigService;

$keys = [
	ConfigService::KEY_SLICER_INTERNAL_URL,
	ConfigService::KEY_MOONRAKER_INTERNAL_URL,
	ConfigService::KEY_MOONRAKER_CAMERA_URL,
	ConfigService::KEY_PRINTER_DISPLAY_NAME,
	ConfigService::KEY_ALLOWED_GROUPS,
	ConfigService::KEY_MULTI_PRINTERS,
	ConfigService::KEY_SLICER_ENABLED,
	ConfigService::KEY_MOONRAKER_ENABLED,
];
$settings = [];
foreach ($keys as $key) {
	$settings[$key] = $_[$key] ?? '';
}
$settingsJson = htmlspecialchars(
	json_encode($settings, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES),
	ENT_QUOTES,
	'UTF-8',
);
$saveUrl = htmlspecialchars((string)($_['save_url'] ?? ''), ENT_QUOTES, 'UTF-8');
$discoverUrl = htmlspecialchars((string)($_['discover_url'] ?? ''), ENT_QUOTES, 'UTF-8');
?>
<div id="nc-print-admin-settings" class="section" data-settings="<?php echo $settingsJson; ?>" data-save-url="<?php echo $saveUrl; ?>" data-discover-url="<?php echo $discoverUrl; ?>">
	<h2>NC 3D Print</h2>
	<p class="settings-hint">
		Configure the owned slicing engine (nc-print-slicer), Moonraker printer access, camera snapshot URL, and group gate.
	</p>

	<form id="nc-print-admin-form" class="nc-print-admin-form">
		<label>
			<span>Slicer internal URL</span>
			<input type="url" name="<?php echo ConfigService::KEY_SLICER_INTERNAL_URL; ?>" value="<?php echo htmlspecialchars((string)$_['slicer_internal_url'], ENT_QUOTES, 'UTF-8'); ?>" required>
		</label>
		<label>
			<span>Moonraker internal URL</span>
			<input type="url" name="<?php echo ConfigService::KEY_MOONRAKER_INTERNAL_URL; ?>" value="<?php echo htmlspecialchars((string)$_['moonraker_internal_url'], ENT_QUOTES, 'UTF-8'); ?>" required>
		</label>
		<label>
			<span>Camera snapshot URL</span>
			<input type="url" name="<?php echo ConfigService::KEY_MOONRAKER_CAMERA_URL; ?>" value="<?php echo htmlspecialchars((string)$_['moonraker_camera_url'], ENT_QUOTES, 'UTF-8'); ?>" required>
		</label>
		<label>
			<span>Printer display name</span>
			<input type="text" name="<?php echo ConfigService::KEY_PRINTER_DISPLAY_NAME; ?>" value="<?php echo htmlspecialchars((string)$_['printer_display_name'], ENT_QUOTES, 'UTF-8'); ?>">
		</label>
		<label>
			<span>Allowed groups (comma-separated)</span>
			<input type="text" name="<?php echo ConfigService::KEY_ALLOWED_GROUPS; ?>" value="<?php echo htmlspecialchars((string)$_['allowed_groups'], ENT_QUOTES, 'UTF-8'); ?>">
		</label>
		<label>
			<span>Multi-printer config (JSON array)</span>
			<textarea name="<?php echo ConfigService::KEY_MULTI_PRINTERS; ?>" rows="6" placeholder='[{"id":"k1","name":"K1 Max","moonraker_url":"http://10.0.0.210:7125","camera_url":"http://10.0.0.210:8080/?action=snapshot","default":true}]'><?php echo htmlspecialchars((string)($_['multi_printers'] ?? ''), ENT_QUOTES, 'UTF-8'); ?></textarea>
		</label>
		<p class="settings-hint">
			Each entry: <code>id</code>, <code>name</code>, <code>moonraker_url</code>, optional <code>moonraker_ws_url</code>, <code>camera_url</code>, <code>default</code>.
		</p>
		<div class="nc-print-admin-discover">
			<button type="button" id="nc-print-discover-btn" class="secondary">Discover printers on network</button>
			<p id="nc-print-discover-status" class="settings-hint" aria-live="polite"></p>
			<div id="nc-print-discover-results"></div>
		</div>
		<label class="checkbox">
			<input type="checkbox" name="<?php echo ConfigService::KEY_SLICER_ENABLED; ?>" value="yes" <?php echo !empty($_['slicer_enabled']) ? 'checked' : ''; ?>>
			<span>Slicer enabled</span>
		</label>
		<label class="checkbox">
			<input type="checkbox" name="<?php echo ConfigService::KEY_MOONRAKER_ENABLED; ?>" value="yes" <?php echo !empty($_['moonraker_enabled']) ? 'checked' : ''; ?>>
			<span>Moonraker enabled</span>
		</label>
		<button type="submit" class="primary">Save</button>
		<p id="nc-print-admin-status" class="settings-hint" aria-live="polite"></p>
	</form>
</div>
