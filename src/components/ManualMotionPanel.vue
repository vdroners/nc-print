<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'
import { homeAll, homeZ, jogAxis, disableSteppers } from '@/services/moonraker-api.js'
import { toastError, toastSuccess } from '@/services/toast.js'
import NcPrintIcon from './NcPrintIcon.vue'

const JOG_STEPS = [0.1, 1, 10]

export default {
	name: 'ManualMotionPanel',
	components: { NcPrintIcon },
	data() {
		return {
			jogStep: 1,
			busy: false,
		}
	},
	computed: {
		...mapStores(usePrintStore),
		printerId() {
			return this.printStore.selectedPrinterId || undefined
		},
		show() {
			return this.printStore.printerState.connected && !this.printStore.printerControls.isActive
		},
		disabled() {
			return this.busy || !this.printStore.printerState.connected
		},
	},
	methods: {
		async withBusy(fn, successMsg) {
			this.busy = true
			try {
				await fn()
				await this.printStore.refreshPrinterState()
				if (successMsg) {
					toastSuccess(successMsg)
				}
			} catch (e) {
				toastError('Motion command failed', e)
			} finally {
				this.busy = false
			}
		},
		onHomeAll() {
			return this.withBusy(() => homeAll(this.printerId), 'Homing all axes')
		},
		onHomeZ() {
			return this.withBusy(() => homeZ(this.printerId), 'Homing Z')
		},
		onDisable() {
			return this.withBusy(() => disableSteppers(this.printerId), 'Steppers disabled')
		},
		onJog(axis, sign) {
			const distance = sign * this.jogStep
			return this.withBusy(() => jogAxis(axis, distance, this.printerId))
		},
	},
}
</script>

<template>
	<div v-if="show" class="nc-print-card nc-print-motion">
		<h2 class="nc-print-card__title">
			<span class="nc-print-card__title-row">
				<NcPrintIcon name="home" :size="18" />
				Manual motion
			</span>
		</h2>
		<p class="nc-print-motion__lead">
			Home and jog when idle. Motion is blocked while a print is active.
		</p>

		<div class="nc-print-card--inset">
			<p class="nc-print-section-label">Jog controls</p>
			<div class="nc-print-field">
				<label for="nc-print-jog-step">Jog step (mm)</label>
				<select id="nc-print-jog-step" v-model.number="jogStep" :disabled="disabled">
					<option v-for="s in JOG_STEPS" :key="s" :value="s">{{ s }}</option>
				</select>
			</div>

			<div class="nc-print-motion__pad">
				<div class="nc-print-motion__row">
					<span />
					<button type="button" class="nc-print-btn" :disabled="disabled" @click="onJog('y', 1)">Y+</button>
					<span />
				</div>
				<div class="nc-print-motion__row">
					<button type="button" class="nc-print-btn" :disabled="disabled" @click="onJog('x', -1)">X−</button>
					<button type="button" class="nc-print-btn" :disabled="disabled" @click="onHomeAll">Home</button>
					<button type="button" class="nc-print-btn" :disabled="disabled" @click="onJog('x', 1)">X+</button>
				</div>
				<div class="nc-print-motion__row">
					<span />
					<button type="button" class="nc-print-btn" :disabled="disabled" @click="onJog('y', -1)">Y−</button>
					<span />
				</div>
				<div class="nc-print-motion__row nc-print-motion__row--z">
					<button type="button" class="nc-print-btn" :disabled="disabled" @click="onJog('z', 1)">Z+</button>
					<button type="button" class="nc-print-btn" :disabled="disabled" @click="onHomeZ">Home Z</button>
					<button type="button" class="nc-print-btn" :disabled="disabled" @click="onJog('z', -1)">Z−</button>
				</div>
			</div>

			<div class="nc-print-actions">
				<button type="button" class="nc-print-btn" :disabled="disabled" @click="onDisable">
					Disable steppers
				</button>
			</div>
		</div>
	</div>
</template>

<style scoped>
.nc-print-motion__lead {
	color: var(--nc-gcs-text-muted);
	font-size: var(--nc-gcs-text-sm);
	margin: 0 0 12px;
}
.nc-print-motion__pad {
	display: flex;
	flex-direction: column;
	gap: 6px;
	margin-bottom: 12px;
}

.nc-print-motion__row {
	display: grid;
	gap: 6px;
	grid-template-columns: repeat(3, 1fr);
}

.nc-print-motion__row--z {
	margin-top: 8px;
}
</style>
