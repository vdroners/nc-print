<?php

declare(strict_types=1);

namespace OCP;

interface IRequest
{
	public function getParams(): array;

	/** @return array<string, mixed>|null */
	public function getUploadedFile(string $key);
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
}
