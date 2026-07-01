<script>
import { mapStores } from 'pinia'
import { usePrintStore } from '@/store/print.js'

export default {
	name: 'WorkflowStepper',
	computed: {
		...mapStores(usePrintStore),
		steps() {
			return [
				{ id: 'prepare', label: 'Prepare', done: this.printStore.prepareComplete },
				{ id: 'slice', label: 'Slice', done: this.printStore.sliceComplete },
				{ id: 'print', label: 'Print', done: this.printStore.printerControls.isActive },
			]
		},
	},
	methods: {
		go(step) {
			this.printStore.setActiveTab(step)
		},
	},
}
</script>

<template>
	<ol class="nc-print-wizard" aria-label="Workflow steps">
		<li
			v-for="(step, idx) in steps"
			:key="step.id"
			class="nc-print-wizard__step"
			:class="{
				'nc-print-wizard__step--active': printStore.activeTab === step.id,
				'nc-print-wizard__step--done': step.done,
			}">
			<button
				type="button"
				class="nc-print-wizard__btn"
				:aria-current="printStore.activeTab === step.id ? 'step' : null"
				@click="go(step.id)">
				<span class="nc-print-wizard__num">{{ step.done ? '✓' : idx + 1 }}</span>
				{{ step.label }}
			</button>
		</li>
	</ol>
</template>
