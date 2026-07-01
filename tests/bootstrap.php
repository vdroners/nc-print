<?php

declare(strict_types=1);

date_default_timezone_set('UTC');

foreach ([
	__DIR__ . '/../vendor/autoload.php',
] as $autoloadPath) {
	if (is_file($autoloadPath)) {
		require_once $autoloadPath;
		break;
	}
}
