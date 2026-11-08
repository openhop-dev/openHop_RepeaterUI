<script setup lang="ts">
import Spinner from '@/components/ui/Spinner.vue';
import { formatPubkey } from '@/utils/formatters';

defineOptions({ name: 'DiscoveredRegions' });

interface DiscoveredRegion {
  name: string;
  /** Pubkeys of the neighbours that reported this region. */
  neighbors: string[];
  /** Already present in the region list, including as an unsaved addition. */
  carried: boolean;
}

interface Props {
  regions: DiscoveredRegion[];
  loading?: boolean;
  error?: string | null;
  /** False outside edit mode: additions are drafts and need somewhere to land. */
  canAdd?: boolean;
}

withDefaults(defineProps<Props>(), {
  loading: false,
  error: null,
  canAdd: false,
});

const emit = defineEmits<{
  add: [name: string];
  refresh: [];
}>();

const reportedBy = (region: DiscoveredRegion) =>
  `Reported by ${region.neighbors.length} neighbour${region.neighbors.length === 1 ? '' : 's'}: ` +
  region.neighbors.map((pubkey) => formatPubkey(pubkey)).join(', ');
</script>

<template>
  <div class="cfg-section space-y-4 h-full flex flex-col">
    <div class="flex items-start justify-between gap-3">
      <div>
        <h3 class="text-lg font-semibold text-content-primary">Discovered Regions</h3>
        <p class="text-content-secondary dark:text-content-muted text-xs mt-1">
          Regions neighbouring repeaters reported when their scopes were queried.
        </p>
      </div>
      <button
        class="cfg-btn-secondary flex-shrink-0"
        :disabled="loading"
        title="Re-read the stored scope answers"
        @click="emit('refresh')"
      >
        Refresh
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center py-8">
      <Spinner />
      <span class="ml-2 text-content-secondary dark:text-content-muted">
        Loading discovered regions…
      </span>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="text-center py-8">
      <div class="text-accent-red mb-2">⚠️ Could not load discovered regions</div>
      <div class="text-content-secondary dark:text-content-muted text-sm">{{ error }}</div>
      <button class="cfg-btn-secondary mt-4" @click="emit('refresh')">Retry</button>
    </div>

    <!-- Empty -->
    <div v-else-if="regions.length === 0" class="text-center py-8">
      <div class="text-content-muted mb-2">No regions discovered yet</div>
      <div class="text-content-muted/opacity-heavy text-sm">
        Query a repeater's scopes from the Neighbors page, or wait for the next neighbours
        publication cycle.
      </div>
    </div>

    <!-- List -->
    <template v-else>
      <ul class="space-y-2 flex-1">
        <li
          v-for="region in regions"
          :key="region.name"
          class="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
          :class="
            region.carried
              ? 'bg-accent-green/opacity-light border-accent-green/opacity-medium'
              : 'bg-background-mute dark:bg-white/opacity-subtle border-stroke-subtle dark:border-stroke/opacity-medium'
          "
        >
          <div class="min-w-0">
            <div
              class="flex items-center gap-1.5 text-sm font-medium truncate"
              :class="region.carried ? 'text-accent-green' : 'text-content-primary'"
            >
              <svg
                class="w-3.5 h-3.5 flex-shrink-0 text-secondary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"
                />
              </svg>
              <span class="truncate">{{ region.name }}</span>
            </div>
            <div
              class="text-content-muted text-[10px] sm:text-xs truncate"
              :title="reportedBy(region)"
            >
              {{ region.neighbors.length }}
              neighbour{{ region.neighbors.length === 1 ? '' : 's' }}
            </div>
          </div>

          <span
            v-if="region.carried"
            class="text-accent-green text-xs whitespace-nowrap flex-shrink-0"
          >
            Carried
          </span>
          <button
            v-else
            type="button"
            class="flex items-center justify-center w-6 h-6 flex-shrink-0 rounded-full text-accent-green hover:bg-accent-green/opacity-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            :disabled="!canAdd"
            :aria-label="`Add region ${region.name}`"
            :title="canAdd ? `Add ${region.name} to the region list` : 'Not available while saving'"
            @click="emit('add', region.name)"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="3"
                d="M12 5v14M5 12h14"
              />
            </svg>
          </button>
        </li>
      </ul>
      <p class="text-content-muted text-xs">
        <span class="text-accent-green font-medium">+</span> adds a region to the list on the left;
        it is created when you save.
      </p>
    </template>
  </div>
</template>
