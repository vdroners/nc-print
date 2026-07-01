<?php

declare(strict_types=1);

/**
 * CLI gate runner for nc_print (run inside cloud_app when deployed).
 *
 *   docker exec -u www-data cloud_app php \
 *     /var/www/html/custom_apps/nc_print/tools/print-api-gates.php
 */

require '/var/www/html/lib/base.php';

\OC::$CLI = true;

$userId = getenv('NC_PRINT_USER') ?: 'admin';
\OC_User::setUserId($userId);

$fail = 0;

function gate(string $id, bool $pass, string $detail = ''): void
{
	global $fail;
	if (!$pass) {
		$fail++;
	}
	echo sprintf("%s %s %s\n", $id, $pass ? 'PASS' : 'FAIL', $detail);
}

$appManager = \OC::$server->get(\OCP\App\IAppManager::class);
gate('G00', $appManager->isInstalled('nc_print'), 'nc_print installed');

$infoPath = '/var/www/html/custom_apps/nc_print/appinfo/info.xml';
$version = '0.0.0';
if (is_readable($infoPath)) {
	$raw = file_get_contents($infoPath);
	if (is_string($raw) && preg_match('/<version>([^<]+)<\/version>/', $raw, $m)) {
		$version = $m[1];
	}
}
gate('G01', version_compare($version, '1.0.0', '>='), 'version=' . $version);

try {
	$config = \OC::$server->get(\OCA\NcPrint\Service\ConfigService::class);
	gate('G02', $config->getSlicerInternalUrl() !== '', 'slicer_url set');
	gate('G03', $config->getMoonrakerInternalUrl() !== '', 'moonraker_url set');
} catch (\Throwable $e) {
	gate('G02', false, $e->getMessage());
	gate('G03', false, 'blocked');
}

exit($fail === 0 ? 0 : 1);
