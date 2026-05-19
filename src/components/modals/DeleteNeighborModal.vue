<script setup lang="ts">
interface Neighbor {
  id: number;
  timestamp?: number;
  pubkey?: string;
  node_name?: string | null;
  is_repeater?: boolean;
  route_type?: number | null;
  contact_type?: string;
  latitude?: number | null;
  longitude?: number | null;
  first_seen?: number;
  last_seen?: number;
  rssi?: number | null;
  snr?: number | null;
  advert_count?: number;
  is_new_neighbor?: boolean;
  short_name?: string;
  long_name?: string;
  node_num?: number;
  node_num_hex?: string;
  hw_model?: string;
}

interface Props {
  show: boolean;
  neighbor: Neighbor | null;
}

interface Emits {
  (e: 'close'): void;
  (e: 'delete', neighborId: number): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

// Handle delete
const handleDelete = () => {
  if (!props.neighbor) return;
  emit('delete', props.neighbor.id);
  handleClose();
};

// Handle close
const handleClose = () => {
  emit('close');
};

</script>

<template>
  <Teleport to="body">
  <!-- Modal Backdrop -->
  <div
    v-if="show && neighbor"
    @click.self="handleClose()"
    class="modal-backdrop-heavy"
  >
    <!-- Modal Content -->
    <div
      class="modal-card max-w-md"
    >
      <!-- Header -->
      <div class="flex items-center gap-3 mb-6">
        <svg class="w-6 h-6 text-accent-red" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
          />
        </svg>
        <div>
          <h3 class="text-xl font-semibold text-content-primary dark:text-content-primary">
            Delete Neighbor
          </h3>
          <p class="text-content-secondary dark:text-content-muted text-sm mt-1">
            Are you sure you want to delete this neighbor?
          </p>
        </div>
        <button
          @click="handleClose"
          class="ml-auto text-content-secondary dark:text-content-muted hover:text-content-primary dark:hover:text-content-primary transition-colors"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <!-- Neighbor Info -->
      <div
        class="bg-gray-50 dark:bg-white/5 border border-stroke-subtle dark:border-stroke/10 rounded-lg p-4 mb-6"
      >
        <div class="flex items-center gap-3">
          <div class="flex-1 min-w-0">
            <div class="text-content-primary dark:text-content-primary font-medium truncate">
              {{ neighbor?.node_name || neighbor?.long_name || neighbor?.short_name || 'Unknown' }}
            </div>
            <div class="text-content-secondary dark:text-content-muted text-sm font-mono">
              ID: {{ neighbor?.node_num_hex || neighbor?.node_num || neighbor?.id || 'N/A' }}
            </div>
            <div v-if="neighbor?.contact_type" class="text-white/50 text-xs">
              {{ neighbor.contact_type }}
            </div>
            <div v-if="neighbor?.hw_model" class="text-white/50 text-xs">
              {{ neighbor.hw_model }}
            </div>
          </div>
        </div>
      </div>

      <div class="bg-accent-red/10 border border-accent-red/30 rounded-lg p-4 mb-6">
        <div class="flex items-center gap-2 text-accent-red text-sm">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>This action cannot be undone</span>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="flex gap-3">
        <button
          @click="handleClose"
          class="flex-1 px-4 py-3 bg-background-mute dark:bg-white/5 hover:bg-stroke-subtle dark:hover:bg-white/10 border border-stroke-subtle dark:border-stroke/20 text-content-primary dark:text-content-primary rounded-lg transition-colors"
        >
          Cancel
        </button>

        <button
          @click="handleDelete"
          class="modal-btn-danger"
        >
          Delete
        </button>
      </div>
    </div>
  </div>
  </Teleport>
</template>
