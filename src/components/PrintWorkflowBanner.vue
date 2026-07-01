<script>
import { mapStores } from 'pinia'
import { usePrintStore, TABS } from '@/store/print.js'
import { toastInfo } from '@/services/toast.js'

const STEPS = [
	{ id: TABS.PREPARE, label: 'Prepare' },
	{ id: TABS.SLICE, label: 'Slice' },
	{ id: TABS.PRINT, label: 'Print' },
]

export default {
	name: 'PrintWorkflowBanner',
	computed: {
		...mapStores(usePrintStore),
		steps() {
			return STEPS
		},
	},
	methods: {
		stepSubtitle(stepId) {
			return this.printStore.workflowStepSubtitle(stepId)
		},
		isEnabled(stepId) {
			if (stepId === TABS.SLICE) {
				return this.printStore.prepareComplete
			}
			if (stepId === TABS.PRINT) {
				return this.printStore.printStepEnabled
			}
			return true
		},
		stepClass(stepId) {
			const classes = []
			if (this.printStore.activeTab === stepId) {
				classes.push('nc-print-workflow__step--active')
			}
			if (stepId === TABS.PREPARE && this.printStore.prepareComplete) {
				classes.push('nc-print-workflow__step--done')
			}
			if (stepId === TABS.SLICE && this.printStore.sliceComplete) {
				classes.push('nc-print-workflow__step--done')
			}
			if (stepId === TABS.PRINT && this.printStore.printerControls.isActive) {
				classes.push('nc-print-workflow__step--done')
			}
			if (!this.isEnabled(stepId)) {
				classes.push('nc-print-workflow__step--disabled')
			}
			return classes
		},
		stepDisplay(step, index) {
			if (step.id === TABS.PREPARE && this.printStore.prepareComplete) {
				return '✓'
			}
			if (step.id === TABS.SLICE && this.printStore.sliceComplete) {
				return '✓'
			}
			if (step.id === TABS.PRINT && this.printStore.printerControls.isActive) {
				return '✓'
			}
			return String(index + 1)
		},
		onStepClick(stepId) {
			if (!this.isEnabled(stepId)) {
				if (stepId === TABS.SLICE) {
					toastInfo(this.printStore.firstPrepareBlocker || 'Complete Prepare first')
				} else if (stepId === TABS.PRINT) {
					toastInfo('Slice a model or upload G-code first')
				}
				return
			}
			this.printStore.setActiveTab(stepId)
		},
	},
}
</script>

<template>
	<nav class="nc-print-workflow" aria-label="Prepare, slice, and print workflow">
		<ol class="nc-print-workflow__list">
			<template v-for="(step, index) in steps">
				<li
					:key="step.id"
					class="nc-print-workflow__step"
					:class="stepClass(step.id)">
					<button
						type="button"
						class="nc-print-workflow__btn"
						:aria-current="printStore.activeTab === step.id ? 'step' : null"
						:disabled="!isEnabled(step.id)"
						:title="!isEnabled(step.id) && step.id === TABS.SLICE ? printStore.firstPrepareBlocker : ''"
						@click="onStepClick(step.id)">
						<span class="nc-print-workflow__num">{{ stepDisplay(step, index) }}</span>
						<span class="nc-print-workflow__text">
							<span class="nc-print-workflow__label">{{ step.label }}</span>
							<span class="nc-print-workflow__sub">{{ stepSubtitle(step.id) }}</span>
						</span>
					</button>
				</li>
				<li
					v-if="index < steps.length - 1"
					:key="'conn-' + step.id"
					class="nc-print-workflow__connector"
					aria-hidden="true" />
			</template>
		</ol>
	</nav>
</template>
