import { describe, expect, it } from 'vitest'
import {
	OTHER_MESSAGE,
	TIMEOUT_MESSAGE,
	UNREACHABLE_MESSAGE,
	classifyGcodeTransferError,
	formatGcodeTransferFailure,
	gcodeTransferFailureTitle,
} from '@/utils/gcode-transfer-error.js'

describe('classifyGcodeTransferError', () => {
	it('uses the server timeout class and hides nothing the server already sanitized', () => {
		const result = classifyGcodeTransferError({
			response: {
				status: 502,
				data: {
					error: 'moonraker_timeout',
					failure: 'timeout',
					message: TIMEOUT_MESSAGE,
					retryable: true,
				},
			},
		})
		expect(result.kind).toBe('timeout')
		expect(result.retryable).toBe(true)
		expect(result.message).toBe(TIMEOUT_MESSAGE)
	})

	it('treats connection reset and a missing response as unreachable', () => {
		expect(classifyGcodeTransferError({
			response: {
				status: 502,
				data: {
					error: 'moonraker_unreachable',
					failure: 'unreachable',
					message: UNREACHABLE_MESSAGE,
				},
			},
		}).kind).toBe('unreachable')

		const reset = classifyGcodeTransferError({
			code: 'ECONNRESET',
			message: 'socket hang up',
		})
		expect(reset.kind).toBe('unreachable')
		expect(reset.message).toBe(UNREACHABLE_MESSAGE)
		expect(reset.retryable).toBe(true)
	})

	it('treats a client timeout with no body as timeout', () => {
		const result = classifyGcodeTransferError({
			code: 'ECONNABORTED',
			message: 'timeout of 60000ms exceeded',
		})
		expect(result.kind).toBe('timeout')
		expect(result.message).toBe(TIMEOUT_MESSAGE)
	})

	it('treats connection timed out as unreachable, not a mid-upload timeout', () => {
		expect(classifyGcodeTransferError({
			message: 'Connection timed out after 5001 milliseconds',
		}).kind).toBe('unreachable')
	})

	it('keeps a printer HTTP rejection as other and still retryable', () => {
		const result = classifyGcodeTransferError({
			response: {
				status: 502,
				data: {
					error: 'moonraker_upload_failed',
					failure: 'other',
					message: 'The printer rejected the upload (HTTP 500). Nothing was retried.',
					retryable: true,
				},
			},
		})
		expect(result.kind).toBe('other')
		expect(result.message).toContain('HTTP 500')
		expect(result.retryable).toBe(true)
	})

	it('uses the server message for a validation failure', () => {
		const result = classifyGcodeTransferError({
			response: {
				status: 400,
				data: { error: 'invalid_file', message: 'Upload must be between 1 byte and 50 MB' },
			},
		})
		expect(result.kind).toBe('other')
		expect(result.message).toBe('Upload must be between 1 byte and 50 MB')
	})

	it('does not call a plain exception unreachable', () => {
		const result = classifyGcodeTransferError(new Error('disk full'))
		expect(result.kind).toBe('other')
		expect(result.message).toBe('disk full')
	})

	it('honors retryable false', () => {
		const result = classifyGcodeTransferError({
			response: { status: 400, data: { error: 'invalid_file', message: 'no', retryable: false } },
		})
		expect(result.retryable).toBe(false)
	})

	it('maps a bare gateway timeout status', () => {
		expect(classifyGcodeTransferError({ response: { status: 504, data: '' } }).kind).toBe('timeout')
		expect(classifyGcodeTransferError({ response: { status: 502, data: '' } }).kind).toBe('unreachable')
	})
})

describe('formatGcodeTransferFailure', () => {
	it('adds the second-job warning only when this attempt asked to start', () => {
		const classified = { kind: 'timeout', message: TIMEOUT_MESSAGE, retryable: true }
		expect(formatGcodeTransferFailure(classified, { start: false }).message).toBe(TIMEOUT_MESSAGE)
		expect(formatGcodeTransferFailure(classified, { start: true }).message).toMatch(/second job/)
		const again = formatGcodeTransferFailure(
			formatGcodeTransferFailure(classified, { start: true }),
			{ start: true },
		)
		expect(again.message.match(/second job/g)).toHaveLength(1)
	})

	it('titles timeout differently from unreachable and other', () => {
		expect(gcodeTransferFailureTitle('timeout', false)).toBe('Upload timed out')
		expect(gcodeTransferFailureTitle('timeout', true)).toBe('Send timed out')
		expect(gcodeTransferFailureTitle('unreachable', true)).toBe('Printer unreachable')
		expect(gcodeTransferFailureTitle('other', false)).toBe('Upload failed')
		expect(OTHER_MESSAGE).toMatch(/Nothing was retried/)
	})
})
