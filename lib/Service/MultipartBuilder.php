<?php

declare(strict_types=1);

namespace OCA\NcPrint\Service;

/**
 * Builds multipart/form-data bodies for forge-slicer slice jobs and Moonraker uploads.
 */
final class MultipartBuilder
{
	/**
	 * @param list<string> $filamentIds
	 * @param array<string, mixed>|null $overrides
	 * @return array{body: string, contentType: string}
	 */
	public static function buildSliceMultipart(
		string $modelBinary,
		string $filename,
		string $printerId,
		array $filamentIds,
		string $processId,
		?array $overrides = null,
	): array {
		$boundary = self::generateBoundary();
		$safeName = self::sanitizeFilename($filename);
		$parts = [
			self::filePart($boundary, 'model', $safeName, 'application/octet-stream', $modelBinary),
			self::fieldPart($boundary, 'printer_id', $printerId),
			self::fieldPart($boundary, 'filament_ids', json_encode(array_values($filamentIds), JSON_THROW_ON_ERROR)),
			self::fieldPart($boundary, 'process_id', $processId),
		];
		if ($overrides !== null && $overrides !== []) {
			$parts[] = self::fieldPart($boundary, 'overrides', json_encode($overrides, JSON_THROW_ON_ERROR));
		}
		$body = implode('', $parts) . '--' . $boundary . "--\r\n";

		return [
			'body' => $body,
			'contentType' => 'multipart/form-data; boundary=' . $boundary,
		];
	}

	/**
	 * @return array{body: string, contentType: string}
	 */
	public static function buildMoonrakerUpload(
		string $fileBinary,
		string $filename,
		bool $startPrint = false,
	): array {
		$boundary = self::generateBoundary();
		$safeName = self::sanitizeFilename($filename);
		$parts = [
			self::filePart($boundary, 'file', $safeName, 'application/octet-stream', $fileBinary),
		];
		if ($startPrint) {
			$parts[] = self::fieldPart($boundary, 'print', 'true');
		}
		$body = implode('', $parts) . '--' . $boundary . "--\r\n";

		return [
			'body' => $body,
			'contentType' => 'multipart/form-data; boundary=' . $boundary,
		];
	}

	private static function generateBoundary(): string
	{
		return 'ncprint_' . bin2hex(random_bytes(16));
	}

	private static function sanitizeFilename(string $filename): string
	{
		$filename = str_replace('\\', '/', $filename);
		$base = basename($filename);
		$base = preg_replace('/[^\w.\-()+ ]/u', '_', $base) ?? 'upload.bin';
		return $base !== '' ? $base : 'upload.bin';
	}

	private static function filePart(
		string $boundary,
		string $name,
		string $filename,
		string $mime,
		string $binary,
	): string {
		return '--' . $boundary . "\r\n"
			. 'Content-Disposition: form-data; name="' . $name . '"; filename="' . $filename . "\"\r\n"
			. 'Content-Type: ' . $mime . "\r\n\r\n"
			. $binary . "\r\n";
	}

	private static function fieldPart(string $boundary, string $name, string $value): string
	{
		return '--' . $boundary . "\r\n"
			. 'Content-Disposition: form-data; name="' . $name . "\"\r\n\r\n"
			. $value . "\r\n";
	}
}
