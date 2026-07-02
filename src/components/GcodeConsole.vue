<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { toastError } from '@/services/toast.js'
import NcPrintIcon from './NcPrintIcon.vue'

const MAX_LEN = 256

export default {
	name: 'GcodeConsole',
	components: { NcPrintIcon },
	data() {
		return {
			input: '',
			busy: false,
		}
	},
	computed: {
		...mapStores(usePrintStore),
		// Read-only log is always available; the SEND field only when the
		// admin has enabled the console.
		sendEnabled() {
			return this.printStore.consoleEnabled
		},
		connected() {
			return this.printStore.printerState.connected
		},
		log() {
			return this.printStore.consoleLog
		},
		canSend() {
			const v = this.input.trim()
			return this.sendEnabled && this.connected && !this.busy
				&& v.length > 0 && v.length <= MAX_LEN
				&& !/[^\x20-\x7E]/.test(v)
		},
	},
	updated() {
		this.$nextTick(() => this.scrollToBottom())
	},
	methods: {
		scrollToBottom() {
			const el = this.$refs.scrollback
			if (el) {
				el.scrollTop = el.scrollHeight
			}
		},
		async send() {
			if (!this.canSend) {
				return
			}
			const cmd = this.input.trim()
			this.busy = true
			try {
				await this.printStore.sendConsoleCommand(cmd)
				this.input = ''
			} catch (e) {
				toastError('Console command rejected', e)
			} finally {
				this.busy = false
			}
		},
		clear() {
			this.printStore.clearConsoleLog()
		},
	},
}
</script>

<template>
	<div class="nc-print-card nc-print-console">
		<div class="nc-print-card__header">
			<h2 class="nc-print-card__title">
				<span class="nc-print-card__title-row">
					<NcPrintIcon name="terminal" :size="18" />
					Console
				</span>
			</h2>
			<button type="button" class="nc-print-btn nc-print-btn--sm" @click="clear">Clear</button>
		</div>

		<div ref="scrollback" class="nc-print-console__log" role="log" aria-live="polite">
			<p v-if="!log.length" class="nc-print-console__empty">
				No console output yet. Responses stream live over the printer WebSocket.
			</p>
			<div
				v-for="line in log"
				:key="line.id"
				class="nc-print-console__line"
				:class="`nc-print-console__line--${line.kind}`">
				{{ line.text }}
			</div>
		</div>

		<form v-if="sendEnabled" class="nc-print-console__form" @submit.prevent="send">
			<input
				v-model="input"
				type="text"
				class="nc-print-console__input"
				placeholder="G-code command (e.g. M114)"
				:maxlength="256"
				:disabled="!connected || busy"
				spellcheck="false"
				autocomplete="off">
			<button type="submit" class="nc-print-btn nc-print-btn--primary" :disabled="!canSend">
				Send
			</button>
		</form>
		<p v-else class="nc-print-console__disabled">
			Command input is disabled. An administrator can enable the G-code console in NC Print settings.
		</p>
	</div>
</template>

<style scoped>
.nc-print-console__log {
	background: var(--nc-gcs-bg-app, #111);
	border: 1px solid var(--nc-gcs-border);
	border-radius: var(--nc-gcs-radius-sm, 4px);
	font-family: var(--nc-gcs-font-mono, monospace);
	font-size: 12px;
	height: 220px;
	margin-bottom: 8px;
	overflow-y: auto;
	padding: 8px;
}

.nc-print-console__line {
	white-space: pre-wrap;
	word-break: break-word;
}

.nc-print-console__line--command {
	color: var(--nc-app-accent, #4f9cf9);
	font-weight: 600;
}

.nc-print-console__line--error {
	color: var(--nc-gcs-danger, #ef4444);
}

.nc-print-console__empty {
	color: var(--nc-gcs-text-muted);
	font-family: var(--nc-gcs-font, sans-serif);
	margin: 0;
}

.nc-print-console__form {
	display: flex;
	gap: 8px;
}

.nc-print-console__input {
	flex: 1;
	font-family: var(--nc-gcs-font-mono, monospace);
}

.nc-print-console__disabled {
	color: var(--nc-gcs-text-muted);
	font-size: var(--nc-gcs-text-sm);
	margin: 0;
}
</style>
