<?php

declare(strict_types=1);

namespace OCP;

interface IRequest
{
	public function getParams(): array;

	/** @return array<string, mixed>|null */
	public function getUploadedFile(string $key);
}

interface IConfig
{
	public function getAppValue(string $appName, string $key, string $default = ''): string;

	public function setAppValue(string $appName, string $key, string $value): void;
}

namespace OCP\AppFramework;

use OCP\IRequest;

class App
{
	public function __construct(string $appName)
	{
	}
}

class Controller
{
	protected IRequest $request;

	public function __construct(string $appName, IRequest $request)
	{
		$this->request = $request;
	}
}

class Http
{
	public const STATUS_OK = 200;
	public const STATUS_BAD_REQUEST = 400;
	public const STATUS_FORBIDDEN = 403;
	public const STATUS_NOT_FOUND = 404;
	public const STATUS_INTERNAL_SERVER_ERROR = 500;
}

namespace OCP\AppFramework\Http;

class Response
{
}

class JSONResponse extends Response
{
	/** @param array<string, mixed> $data */
	public function __construct(
		private array $data = [],
		private int $status = 200,
	) {
	}

	public function getStatus(): int
	{
		return $this->status;
	}

	/** @return array<string, mixed> */
	public function getData(): array
	{
		return $this->data;
	}
}

namespace OCP\Files;

class NotFoundException extends \Exception
{
}

interface File
{
	public function getName(): string;

	public function getSize(): int;

	public function getMimeType(): string;

	public function getInternalPath(): string;

	public function getId(): int;

	public function getParent();

	public function getContent(): string;

	public function putContent(string $data): void;
}

interface Folder
{
	public function nodeExists(string $path): bool;

	public function get(string $path);

	/** @return File */
	public function newFile(string $path);

	public function getInternalPath(): string;
}

interface IRootFolder extends Folder
{
}

namespace OCP\Files;

class NotPermittedException extends \Exception
{
}

namespace OCP\AppFramework\Bootstrap;

interface IBootstrap
{
}

interface IRegistrationContext
{
}

interface IBootContext
{
}

namespace Psr\Log;

interface LoggerInterface
{
	public function emergency($message, array $context = []): void;
	public function alert($message, array $context = []): void;
	public function critical($message, array $context = []): void;
	public function error($message, array $context = []): void;
	public function warning($message, array $context = []): void;
	public function notice($message, array $context = []): void;
	public function info($message, array $context = []): void;
	public function debug($message, array $context = []): void;
	public function log($level, $message, array $context = []): void;
}

// ── DB-layer stubs (print history, v1.37) ────────────────────────────────────
// Minimal shims so the pure-logic unit tests can load PrintRecord / (mocked)
// PrintRecordMapper without a real Nextcloud framework. The Entity stub
// implements just enough (addType + magic get/set over snake_case columns) for
// PrintHistoryService::record() normalization to be assertable.

namespace OCP\AppFramework\Db;

class DoesNotExistException extends \Exception
{
}

class MultipleObjectsReturnedException extends \Exception
{
}

abstract class Entity
{
	/** @var int|null */
	public $id;
	private array $_fieldTypes = [];

	protected function addType(string $field, string $type): void
	{
		$this->_fieldTypes[$field] = $type;
	}

	public function __call(string $name, array $args)
	{
		if (str_starts_with($name, 'set') && count($args) === 1) {
			$prop = lcfirst(substr($name, 3));
			$this->{$prop} = $args[0];
			return null;
		}
		if (str_starts_with($name, 'get')) {
			$prop = lcfirst(substr($name, 3));
			return $this->{$prop} ?? null;
		}
		throw new \BadMethodCallException($name);
	}
}

abstract class QBMapper
{
	public function __construct($db, string $tableName, string $entityClass)
	{
	}

	public function insert(Entity $entity): Entity
	{
		return $entity;
	}

	public function update(Entity $entity): Entity
	{
		return $entity;
	}

	public function delete(Entity $entity): Entity
	{
		return $entity;
	}
}

namespace OCP\AppFramework\Utility;

interface ITimeFactory
{
	public function getTime(): int;
}

namespace OCP;

interface IDBConnection
{
}

namespace OCP\DB\QueryBuilder;

interface IQueryBuilder
{
	public const PARAM_INT = 1;
	public const PARAM_STR = 2;
	public const PARAM_DATE = 3;
	public const PARAM_STR_ARRAY = 102;
}

namespace OCP\Http\Client;

interface IResponse
{
	public function getBody();

	public function getStatusCode(): int;
}

interface IClient
{
	public function get(string $uri, array $options = []): IResponse;
}

interface IClientService
{
	public function newClient(): IClient;
}
