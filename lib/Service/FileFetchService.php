<?php

declare(strict_types=1);

namespace OCA\NcPrint\Service;

use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\NotFoundException;
use OCP\Files\NotPermittedException;

class FileFetchService
{
	private const MAX_BYTES = 50 * 1024 * 1024;
	private const MODEL_EXT = ['stl', '3mf', 'obj'];

	public function resolveNode(Folder $userRoot, ?string $davPath, ?int $fileId): File
	{
		if ($fileId !== null && $fileId > 0) {
			$nodes = $userRoot->getById($fileId);
			foreach ($nodes as $node) {
				if ($node instanceof File && $node->getSize() <= self::MAX_BYTES) {
					$this->assertModelFile($node->getName());
					return $node;
				}
			}
			throw new NotFoundException('File not found or not accessible');
		}

		$rel = ltrim((string) $davPath, '/');
		if ($rel === '') {
			throw new \InvalidArgumentException('path_required');
		}
		if (!$userRoot->nodeExists($rel)) {
			throw new NotFoundException('File not found');
		}
		$node = $userRoot->get($rel);
		if (!($node instanceof File)) {
			throw new \InvalidArgumentException('not_a_file');
		}
		$this->assertModelFile($node->getName());
		if ($node->getSize() > self::MAX_BYTES) {
			throw new \InvalidArgumentException('file_too_large');
		}
		return $node;
	}

	/** @return array{ok: bool, basename: string, size: int, dav_path: string, file_id: int|null} */
	public function describeFile(Folder $userRoot, File $file): array
	{
		$internal = $file->getInternalPath();
		$rootInternal = $userRoot->getInternalPath();
		$rel = $internal;
		if ($rootInternal !== '' && str_starts_with($internal, $rootInternal . '/')) {
			$rel = substr($internal, strlen($rootInternal) + 1);
		}

		return [
			'ok' => true,
			'basename' => $file->getName(),
			'size' => $file->getSize(),
			'dav_path' => '/' . ltrim($rel, '/'),
			'file_id' => $file->getId(),
		];
	}

	public function readFileContents(File $file): string
	{
		try {
			return $file->getContent();
		} catch (NotPermittedException $e) {
			throw new \RuntimeException('read_denied', 0, $e);
		}
	}

	private function assertModelFile(string $name): void
	{
		$ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
		if (!in_array($ext, self::MODEL_EXT, true)) {
			throw new \InvalidArgumentException('invalid_extension');
		}
	}
}
