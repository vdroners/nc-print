<?php
/** @var array $_ */
?>
<div
	id="nc-print-root"
	class="nc-print-app-shell"
	data-app-id="nc_print"
	data-bootstrap="<?php echo htmlspecialchars((string)($_['bootstrap_json'] ?? '{}'), ENT_QUOTES, 'UTF-8'); ?>"
	data-app-version="<?php echo htmlspecialchars((string)($_['app_version'] ?? ''), ENT_QUOTES, 'UTF-8'); ?>">
	<noscript>
		<div style="padding:24px;font-family:system-ui,sans-serif;">
			<h1>NC 3D Print</h1>
			<p>JavaScript is required to slice and monitor prints.</p>
		</div>
	</noscript>
</div>
