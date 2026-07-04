<script setup lang="ts">
import Spinner from '@/components/ui/Spinner.vue';

interface DiscoverySession {
  session_id: string;
  tag: number;
  status: string;
  timeout: number;
  count: number;
  error: string | null;
}

interface DiscoveryResult {
  pub_key: string;
  node_hash?: string | null;
  node_name?: string | null;
  node_type_name?: string;
  inbound_snr?: number;
  response_snr?: number;
  rssi?: number;
  known_neighbor?: boolean;
  zero_hop?: boolean;
  advert_count?: number;
}

interface Props {
  show: boolean;
  loading?: boolean;
  error?: string | null;
  session?: DiscoverySession | null;
  results?: DiscoveryResult[];
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  error: null,
  session: null,
  results: () => [],
});

const emit = defineEmits<{
  close: [];
  rediscover: [];
  ping: [result: DiscoveryResult];
  add: [result: DiscoveryResult];
}>();

const close = () => emit('close');
const rediscover = () => emit('rediscover');
const ping = (result: DiscoveryResult) => emit('ping', result);
const add = (result: DiscoveryResult) => emit('add', result);

const formatRssi = (value?: number) => (value === undefined || value === null ? 'N/A' : `${value} dBm`);
const formatSnr = (value?: number) =>
  value === undefined || value === null ? 'N/A' : `${value >= 0 ? '+' : ''}${value.toFixed(1)} dB`;
const hasMeaningfulNodeName = (value?: string | null) => {
  const normalized = (value || '').trim().toLowerCase();
  return normalized !== '' && normalized !== 'unknown' && normalized !== 'unknown node';
};
const formatNodeLabel = (result: DiscoveryResult) => {
  if (hasMeaningfulNodeName(result.node_name)) return result.node_name as string;
  if (result.node_hash) return result.node_hash;
  const prefix = (result.pub_key || '').slice(0, 4).toUpperCase();
  return prefix ? `0x${prefix}` : 'Unknown Node';
};
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="show" class="modal-backdrop" @click.self="close">
        <div class="modal-card-glass max-w-3xl overflow-hidden" @click.stop>
          <div
            class="bg-gradient-to-r from-primary/20 to-accent-green/20 border-b border-stroke-subtle dark:border-stroke/opacity-light px-6 py-4"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="p-2 bg-accent-green/opacity-medium dark:bg-primary/opacity-medium rounded-lg">
                  <svg
                    class="w-5 h-5 text-accent-green dark:text-primary"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M8 9l4-4 4 4m0 6l-4 4-4-4"
                    />
                  </svg>
                </div>
                <div>
                  <h2 class="text-xl font-bold text-content-primary">Repeater Discovery</h2>
                  <p class="text-sm text-content-secondary dark:text-content-muted">
                    Live nearby node responses
                  </p>
                </div>
              </div>
              <button
                @click="close"
                class="p-2 hover:bg-stroke-subtle dark:hover:bg-white/opacity-light rounded-lg transition-colors text-content-secondary dark:text-content-muted hover:text-content-primary dark:hover:text-content-primary"
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
          </div>

          <div class="p-6 space-y-4">
            <div class="flex flex-wrap items-center gap-3 text-sm">
              <span
                class="px-3 py-1 rounded-full border"
                :class="loading
                  ? 'bg-accent-cyan/opacity-light text-accent-cyan border-accent-cyan/opacity-medium'
                  : error
                    ? 'bg-accent-red/opacity-light text-accent-red border-accent-red/opacity-medium'
                    : 'bg-accent-green/opacity-light text-accent-green border-accent-green/opacity-medium'"
              >
                {{ loading ? 'Discovering…' : error ? 'Error' : 'Complete' }}
              </span>
              <span v-if="session" class="text-content-secondary dark:text-content-muted">
                Tag: #{{ session.tag }}
              </span>
              <span v-if="session" class="text-content-secondary dark:text-content-muted">
                Timeout: {{ session.timeout }}s
              </span>
              <span class="text-content-secondary dark:text-content-muted">
                Found: {{ results.length }}
              </span>
            </div>

            <div v-if="loading && results.length === 0" class="text-center py-10">
              <Spinner size="lg" class="mx-auto mb-4" />
              <p class="text-content-secondary dark:text-content-muted">Broadcasting discovery request...</p>
            </div>

            <div
              v-else-if="error"
              class="rounded-xl border border-accent-red/opacity-medium bg-accent-red/opacity-light p-4 text-accent-red"
            >
              {{ error }}
            </div>

            <div
              v-else-if="results.length === 0"
              class="rounded-xl border border-stroke-subtle dark:border-stroke/opacity-light bg-background-mute dark:bg-white/opacity-subtle p-6 text-center text-content-secondary dark:text-content-muted"
            >
              No nodes discovered in this window.
            </div>

            <div v-else class="max-h-[26rem] overflow-y-auto space-y-3 pr-1">
              <div
                v-for="result in results"
                :key="result.pub_key"
                class="rounded-xl border border-stroke-subtle dark:border-stroke/opacity-light bg-background-mute dark:bg-white/opacity-subtle p-4"
              >
                <div class="flex items-start justify-between gap-4">
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2 flex-wrap">
                      <h3 class="font-semibold text-content-primary truncate">
                        {{ formatNodeLabel(result) }}
                      </h3>
                      <span class="text-xs px-2 py-0.5 rounded-full bg-background-base dark:bg-black/20 text-content-secondary dark:text-content-muted">
                        {{ result.node_type_name || 'Unknown' }}
                      </span>
                      <span
                        v-if="result.known_neighbor"
                        class="text-xs px-2 py-0.5 rounded-full bg-primary/opacity-light text-primary border border-primary/opacity-medium"
                      >
                        Known neighbor
                      </span>
                    </div>
                    <div class="mt-1 text-xs font-mono text-content-secondary dark:text-content-muted break-all">
                      {{ result.pub_key }}
                    </div>
                    <div class="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div>
                        <div class="text-content-muted">Hash</div>
                        <div class="text-content-primary font-medium">{{ result.node_hash || 'N/A' }}</div>
                      </div>
                      <div>
                        <div class="text-content-muted">Inbound SNR</div>
                        <div class="text-content-primary font-medium">{{ formatSnr(result.inbound_snr) }}</div>
                      </div>
                      <div>
                        <div class="text-content-muted">Response SNR</div>
                        <div class="text-content-primary font-medium">{{ formatSnr(result.response_snr) }}</div>
                      </div>
                      <div>
                        <div class="text-content-muted">RSSI</div>
                        <div class="text-content-primary font-medium">{{ formatRssi(result.rssi) }}</div>
                      </div>
                    </div>
                  </div>
                  <div class="shrink-0 flex items-center gap-2">
                    <button
                      v-if="!result.known_neighbor"
                      @click="add(result)"
                      class="px-3 py-2 text-sm rounded-lg bg-accent-green/opacity-light text-accent-green border border-accent-green/opacity-medium hover:bg-accent-green/opacity-medium transition-colors"
                    >
                      Add
                    </button>
                    <button
                      v-if="result.node_hash"
                      @click="ping(result)"
                      class="px-3 py-2 text-sm rounded-lg bg-primary/opacity-medium text-primary border border-primary/opacity-medium hover:bg-primary/opacity-heavy transition-colors"
                    >
                      Ping
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="px-6 py-4 border-t border-stroke-subtle dark:border-stroke/opacity-light flex items-center justify-end gap-3">
            <button
              @click="close"
              class="px-4 py-2 rounded-lg bg-background-mute dark:bg-white/opacity-light text-content-secondary dark:text-content-primary border border-stroke-subtle dark:border-stroke/opacity-medium hover:bg-stroke-subtle dark:hover:bg-white/opacity-medium transition-colors"
            >
              Close
            </button>
            <button
              @click="rediscover"
              class="px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
            >
              Discover Again
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>