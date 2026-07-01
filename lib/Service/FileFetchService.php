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
	private const GCODE_EXT = ['gcode'];

	public function resolveNode(Folder $userRoot, ?string $davPath, ?int $fileId, bool $allowGcode = false): File
	{
		$allowed = self::MODEL_EXT;
		if ($allowGcode) {
			$allowed = array_merge($allowed, self::GCODE_EXT);
		}

		if ($fileId !== null && $fileId > 0) {
			$nodes = $userRoot->getById($fileId);
			foreach ($nodes as $node) {
				if ($node instanceof File && $node->getSize() <= self::MAX_BYTES) {
					$this->assertAllowedFile($node->getName(), $allowed);
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
		$this->assertAllowedFile($node->getName(), $allowed);
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

	/**
	 * Write G-code as a sibling file next to the model (same folder, stem.gcode).
	 *
	 * @return array{ok: bool, basename: string, size: int, dav_path: string, file_id: int|null}
	 */
	public function writeGcodeSibling(Folder $userRoot, File $modelFile, string $gcodeContent): array
	{
		if (strlen($gcodeContent) > self::MAX_BYTES) {
			throw new \InvalidArgumentException('gcode_too_large');
		}

		$parent = $modelFile->getParent();
		if (!($parent instanceof Folder)) {
			throw new \RuntimeException('no_parent_folder');
		}

		$stem = pathinfo($modelFile->getName(), PATHINFO_FILENAME);
		if ($stem === '') {
			throw new \InvalidArgumentException('invalid_model_name');
		}
		$gcodeName = $stem . '.gcode';

		if ($parent->nodeExists($gcodeName)) {
			$node = $parent->get($gcodeName);
			if (!($node instanceof File)) {
				throw new \InvalidArgumentException('sibling_not_a_file');
			}
			try {
				$node->putContent($gcodeContent);
			} catch (NotPermittedException $e) {
				throw new \RuntimeException('write_denied', 0, $e);
			}
			return $this->describeFile($userRoot, $node);
		}

		try {
			$file = $parent->newFile($gcodeName);
			$file->putContent($gcodeContent);
		} catch (NotPermittedException $e) {
			throw new \RuntimeException('write_denied', 0, $e);
		}

		return $this->describeFile($userRoot, $file);
	}

	public function resolveModelNode(Folder $userRoot, ?string $davPath, ?int $fileId): File
	{
		return $this->resolveNode($userRoot, $davPath, $fileId, false);
	}

	private function assertAllowedFile(string $name, array $allowed): void
	{
		$ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
		if (!in_array($ext, $allowed, true)) {
			throw new \InvalidArgumentException('invalid_extension');
		}
	}

	private function assertModelFile(string $name): void
	{
		$this->assertAllowedFile($name, self::MODEL_EXT);
	}
}
