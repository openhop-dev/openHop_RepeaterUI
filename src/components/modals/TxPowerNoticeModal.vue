<script setup lang="ts">
import { AlertTriangle } from '@lucide/vue';

interface Props {
  show: boolean;
  confirmed: boolean;
  selectedTxPower?: number | null;
  actionLabel?: string;
  busy?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  selectedTxPower: null,
  actionLabel: 'I Understand, Continue',
  busy: false,
});

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void;
  (e: 'update:confirmed', value: boolean): void;
  (e: 'confirm'): void;
}>();

function closeModal() {
  emit('update:show', false);
}

function onConfirm() {
  if (!props.confirmed || props.busy) return;
  emit('confirm');
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="show"
        class="modal-backdrop"
        @click.self="closeModal"
      >
      <div class="w-full max-w-2xl rounded-3xl border border-accent-amber/30 bg-white dark:bg-surface-elevated shadow-[0_20px_80px_color-mix(in_srgb,var(--color-shadow-strong)_35%,transparent)] overflow-hidden">
        <div class="p-5 border-b border-accent-amber/20 bg-accent-amber/5">
          <div class="flex items-start gap-3">
            <div class="rounded-full bg-accent-amber/15 text-accent-amber p-2">
              <AlertTriangle class="w-5 h-5" />
            </div>
            <div>
              <h4 class="text-content-primary dark:text-content-primary text-base font-semibold">
                TX Power &amp; PA Configuration Notice
              </h4>
              <p v-if="selectedTxPower !== null" class="text-xs text-content-secondary dark:text-content-muted mt-1">
                Selected TX power: {{ selectedTxPower }} dBm
              </p>
              <p v-else class="text-xs text-content-secondary dark:text-content-muted mt-1">
                Review this safety notice before applying TX power changes.
              </p>
            </div>
          </div>
        </div>

        <div class="p-5 space-y-3 text-sm text-content-secondary dark:text-content-muted max-h-[60vh] overflow-y-auto">
          <p class="leading-relaxed">
            Always ensure your configured TX power complies with local country and regional radio regulations before transmitting.
          </p>
          <p class="leading-relaxed">
            Before changing TX power settings, research your specific LoRa board/module design carefully. Many SX1262-based boards include an external Power Amplifier (PA) and RF switching circuitry, which may require different configuration values, TX paths, or firmware settings than a standard SX1262 reference design.
          </p>
          <p class="leading-relaxed">
            Do not assume all boards support the same maximum power levels or PA configuration methods.
          </p>
          <div class="rounded-xl border border-stroke-subtle dark:border-white/10 bg-background-mute/60 dark:bg-white/5 p-3">
            <p class="text-content-primary dark:text-content-primary font-medium mb-2">Recommended checks before applying changes:</p>
            <ul class="list-disc pl-5 space-y-1">
              <li>Verify whether your board includes an external PA/LNA stage</li>
              <li>Confirm the manufacturer&rsquo;s recommended TX power limits</li>
              <li>Check required RXen/TXen or RF switch pin configuration</li>
              <li>Use board-specific library settings where available</li>
              <li>Ensure thermal limits and duty cycle recommendations are respected</li>
              <li>Never transmit without a correctly connected antenna or suitable load</li>
            </ul>
          </div>
          <p class="leading-relaxed text-accent-amber font-medium">
            Incorrect PA configuration can damage hardware, lock the radio into a busy state, or cause illegal RF output levels.
          </p>

          <label class="flex items-start gap-2 pt-1">
            <input
              :checked="confirmed"
              type="checkbox"
              class="mt-0.5"
              @change="emit('update:confirmed', ($event.target as HTMLInputElement).checked)"
            />
            <span class="text-content-primary dark:text-content-primary">I have read and understood this warning.</span>
          </label>
        </div>

        <div class="p-5 border-t border-stroke-subtle dark:border-white/10 flex items-center justify-end gap-2">
          <button type="button" class="cfg-btn-secondary" @click="closeModal">
            Cancel
          </button>
          <button
            type="button"
            class="cfg-btn-primary"
            :disabled="!confirmed || busy"
            @click="onConfirm"
          >
            {{ actionLabel }}
          </button>
        </div>
      </div>
    </div>
    </Transition>
  </Teleport>
</template>