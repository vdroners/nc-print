<?php

declare(strict_types=1);

return [
	'routes' => [
		['name' => 'page#index', 'url' => '/', 'verb' => 'GET'],
		['name' => 'api#config', 'url' => '/api/config', 'verb' => 'GET'],
		['name' => 'api#status', 'url' => '/api/status', 'verb' => 'GET'],
		['name' => 'files#resolve', 'url' => '/api/files/resolve', 'verb' => 'POST'],
		['name' => 'files#fetch', 'url' => '/api/files/fetch', 'verb' => 'POST'],
		['name' => 'files#saveGcode', 'url' => '/api/files/save-gcode', 'verb' => 'POST'],
		['name' => 'camera#frame', 'url' => '/api/camera/frame.jpeg', 'verb' => 'GET'],
		['name' => 'ws_ticket#issue', 'url' => '/api/ws-ticket', 'verb' => 'GET'],
		['name' => 'admin#saveSettings', 'url' => '/api/admin/settings', 'verb' => 'PUT'],
		['name' => 'admin#discoverPrinters', 'url' => '/api/admin/discover-printers', 'verb' => 'POST'],

		['name' => 'printer#state', 'url' => '/api/printer/state', 'verb' => 'GET'],
		['name' => 'printer#pause', 'url' => '/api/printer/pause', 'verb' => 'POST'],
		['name' => 'printer#resume', 'url' => '/api/printer/resume', 'verb' => 'POST'],
		['name' => 'printer#cancel', 'url' => '/api/printer/cancel', 'verb' => 'POST'],
		['name' => 'printer#setTemperature', 'url' => '/api/printer/temperature', 'verb' => 'POST'],
		['name' => 'printer#emergencyStop', 'url' => '/api/printer/emergency-stop', 'verb' => 'POST'],
		['name' => 'printer#gcodeAction', 'url' => '/api/printer/gcode-action', 'verb' => 'POST'],
		['name' => 'printer#consoleCommand', 'url' => '/api/printer/console', 'verb' => 'POST'],
		['name' => 'printer#upload', 'url' => '/api/printer/upload', 'verb' => 'POST'],

		['name' => 'printer_discovery#discover', 'url' => '/api/printers/discover', 'verb' => 'POST'],

		['name' => 'eta#predict', 'url' => '/api/eta/predict', 'verb' => 'POST'],
		['name' => 'eta#record', 'url' => '/api/eta/record', 'verb' => 'POST'],
		['name' => 'eta#stats', 'url' => '/api/eta/stats', 'verb' => 'GET'],

		['name' => 'slicer_proxy#proxy', 'url' => '/api/slicer/{path}', 'verb' => 'GET', 'requirements' => ['path' => '.+']],
		['name' => 'slicer_proxy#proxy', 'url' => '/api/slicer/{path}', 'verb' => 'POST', 'requirements' => ['path' => '.+'], 'postfix' => 'slicer_post'],
		['name' => 'slicer_proxy#proxy', 'url' => '/api/slicer/{path}', 'verb' => 'PUT', 'requirements' => ['path' => '.+'], 'postfix' => 'slicer_put'],
		['name' => 'slicer_proxy#proxy', 'url' => '/api/slicer/{path}', 'verb' => 'DELETE', 'requirements' => ['path' => '.+'], 'postfix' => 'slicer_delete'],
		['name' => 'slicer_proxy#proxy', 'url' => '/api/slicer/{path}', 'verb' => 'PATCH', 'requirements' => ['path' => '.+'], 'postfix' => 'slicer_patch'],

		['name' => 'moonraker_proxy#proxy', 'url' => '/api/moonraker/{path}', 'verb' => 'GET', 'requirements' => ['path' => '.+']],
		['name' => 'moonraker_proxy#proxy', 'url' => '/api/moonraker/{path}', 'verb' => 'POST', 'requirements' => ['path' => '.+'], 'postfix' => 'moonraker_post'],
		['name' => 'moonraker_proxy#proxy', 'url' => '/api/moonraker/{path}', 'verb' => 'PUT', 'requirements' => ['path' => '.+'], 'postfix' => 'moonraker_put'],
		['name' => 'moonraker_proxy#proxy', 'url' => '/api/moonraker/{path}', 'verb' => 'DELETE', 'requirements' => ['path' => '.+'], 'postfix' => 'moonraker_delete'],
	],
];
