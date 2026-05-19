<script setup lang="ts">
defineProps<{
  show: boolean;
  isSaving: boolean;
  label?: string;
}>();

defineEmits<{
  discard: [];
  save: [];
  cancel: [];
}>();
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-200"
      leave-to-class="opacity-0"
    >
      <div
        v-if="show"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      >
        <div class="modal-card max-w-md">
          <div class="flex items-start gap-3 mb-4">
            <div
              class="flex-shrink-0 w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center"
            >
              <svg
                class="w-5 h-5 text-amber-600 dark:text-amber-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                />
              </svg>
            </div>
            <div>
              <h3 class="text-base font-semibold text-content-primary dark:text-content-primary">
                Unsaved Changes
              </h3>
              <p class="mt-1 text-sm text-content-secondary dark:text-content-muted">
                {{ label ? label : 'Settings' }} have not been saved. What would you like to do?
              </p>
            </div>
          </div>
          <div class="modal-actions">
            <button
              @click="$emit('cancel')"
              :disabled="isSaving"
              class="modal-btn-cancel"
            >
              Keep Editing
            </button>
            <button
              @click="$emit('discard')"
              :disabled="isSaving"
              class="modal-btn-danger"
            >
              Discard
            </button>
            <button
              @click="$emit('save')"
              :disabled="isSaving"
              class="modal-btn-primary"
            >
              {{ isSaving ? 'Saving…' : 'Save Settings' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
