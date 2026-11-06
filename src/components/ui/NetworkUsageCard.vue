<script setup lang="ts">
import { computed, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useDataService } from '@/stores/dataService';
import { formatUsageBytes } from '@/utils/networkUsage';
import Spinner from '@/components/ui/Spinner.vue';

const dataService = useDataService();
const { networkUsage, usageDays, usageInterface } = storeToRefs(dataService);
const state = computed(() => networkUsage.value[usageDays.value]);
const data = computed(() => state.value?.data);
const selectedInterface = computed(() =>
  data.value?.interfaces.find((item) => item.source === usageInterface.value),
);
const date = (seconds: number) => new Date(seconds * 1000).toLocaleString();
watch(
  usageDays,
  (days, _old, onCleanup) => {
    onCleanup(dataService.subscribeNetworkUsage(days));
  },
  { immediate: true },
);
</script>

<template>
  <section class="glass-card rounded-[15px] p-4 sm:p-6 min-w-0" aria-label="Network and MQTT usage">
    <div class="flex flex-wrap items-end justify-between gap-3 mb-4">
      <div>
        <h3 class="text-content-primary text-xl font-semibold">Network and MQTT usage</h3>
        <p class="text-sm text-content-muted mt-1">
          Rolling totals · decimal bytes (1000 B = 1 KB)
        </p>
      </div>
      <div class="flex flex-wrap items-end gap-3">
        <label class="text-sm text-content-secondary">
          Window
          <select
            v-model.number="usageDays"
            aria-label="Usage window"
            class="block mt-1 rounded-lg border border-stroke bg-surface text-content-primary px-3 py-2"
          >
            <option v-for="days in 7" :key="days" :value="days">
              Last {{ days }} {{ days === 1 ? 'day' : 'days' }}
            </option>
          </select>
        </label>
        <button
          type="button"
          class="btn-secondary"
          :disabled="state?.loading"
          @click="dataService.ensureNetworkUsage(usageDays, true)"
        >
          {{ state?.error ? 'Retry' : 'Refresh' }}
        </button>
      </div>
    </div>
    <p
      v-if="state?.loading"
      role="status"
      class="flex items-center gap-2 text-sm text-content-secondary mb-3"
    >
      <Spinner size="sm" /> {{ data ? 'Refreshing usage…' : 'Loading usage…' }}
    </p>
    <p v-if="state?.error" role="alert" class="text-sm text-accent-red mb-3">
      Unable to refresh usage: {{ state.error }}.
      <span v-if="data">Last successful snapshot shown below; totals may be stale.</span>
    </p>
    <template v-if="data">
      <p data-testid="usage-window" class="text-xs text-content-muted break-words">
        {{ date(data.start) }} – {{ date(data.end) }} · {{ data.bucket_seconds }}-second buckets
      </p>
      <p class="text-sm text-content-secondary mt-2 break-words">
        Scope: {{ data.scope }}. Interface counters reflect the visible host or container network
        namespace, not repeater-only traffic. Bridge and VPN interfaces can overlap; only the
        selected interface is shown, never a sum of interfaces.
      </p>
      <p v-if="data.partial" class="text-sm text-accent-amber mt-2">
        Partial history: totals cover only recorded samples, not necessarily the full selected
        window. Gaps and restarts can leave traffic uncounted.
      </p>
      <p v-if="data.available_since !== null" class="text-xs text-content-muted mt-1">
        History available since {{ date(data.available_since) }}.
      </p>
      <p
        v-if="!data.collection.running || data.collection.error"
        role="alert"
        class="text-sm text-accent-amber mt-2"
      >
        {{ data.collection.running ? 'Collector warning' : 'Collection stopped'
        }}<template v-if="data.collection.error">: {{ data.collection.error }}</template
        >. Recorded totals may be incomplete or stale.
      </p>
      <p class="text-xs text-content-muted mt-1">
        Last sample:
        {{ data.collection.last_sample === null ? 'none' : date(data.collection.last_sample) }}.
      </p>
      <p
        v-if="data.available_since === null"
        class="text-sm text-content-secondary mt-4"
        role="status"
      >
        No usage history is available yet. Waiting for recorded samples.
      </p>
      <div v-else class="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-5">
        <div class="min-w-0">
          <h4 class="font-semibold text-content-primary mb-3">Network interface</h4>
          <label class="text-sm text-content-secondary block">
            Interface
            <select
              v-model="usageInterface"
              aria-label="Network interface"
              class="block w-full mt-1 rounded-lg border border-stroke bg-surface text-content-primary px-3 py-2"
            >
              <option value="">Select an interface</option>
              <option v-if="usageInterface && !selectedInterface" :value="usageInterface">
                Selected interface unavailable
              </option>
              <option v-for="item in data.interfaces" :key="item.source" :value="item.source">
                {{ item.name }}
              </option>
            </select>
          </label>
          <dl
            v-if="selectedInterface"
            data-testid="interface-totals"
            class="grid grid-cols-2 gap-4 mt-4"
          >
            <div>
              <dt class="text-sm text-content-muted">Upload</dt>
              <dd class="text-xl font-semibold text-primary tabular-nums break-words">
                {{ formatUsageBytes(selectedInterface.upload_bytes) }}
              </dd>
            </div>
            <div>
              <dt class="text-sm text-content-muted">Download</dt>
              <dd class="text-xl font-semibold text-secondary tabular-nums break-words">
                {{ formatUsageBytes(selectedInterface.download_bytes) }}
              </dd>
            </div>
            <div
              data-testid="interface-total"
              class="col-span-2 border-t border-stroke-subtle pt-3"
            >
              <dt class="text-sm text-content-muted">Combined upload + download</dt>
              <dd class="text-xl font-semibold text-content-primary tabular-nums break-words">
                {{
                  formatUsageBytes(
                    selectedInterface.upload_bytes + selectedInterface.download_bytes,
                  )
                }}
              </dd>
            </div>
          </dl>
          <p v-else class="text-sm text-content-muted mt-3">
            {{
              data.interfaces.length
                ? 'Choose one interface to view its upload and download totals.'
                : 'No interface samples in this window.'
            }}
          </p>
        </div>
        <div class="min-w-0">
          <h4 class="font-semibold text-content-primary mb-2">MQTT uploaded payload</h4>
          <p class="text-xs text-content-muted mb-3">
            Payload bytes accepted locally, not broker receipt or transport costs (TCP, TLS and MQTT
            overhead). These are not additional network-interface bytes.
          </p>
          <dl class="space-y-3">
            <div data-testid="mqtt-total" class="rounded-lg bg-primary/opacity-light p-3">
              <dt class="text-sm font-semibold text-content-primary">All MQTT combined</dt>
              <dd class="text-primary font-semibold tabular-nums break-words">
                {{ formatUsageBytes(data.mqtt.upload_bytes) }}
                <span class="text-sm text-content-secondary font-normal"
                  >· {{ data.mqtt.messages.toLocaleString() }} messages</span
                >
              </dd>
            </div>
            <div
              v-for="broker in data.mqtt.brokers"
              :key="broker.source"
              class="border-t border-stroke-subtle pt-2"
            >
              <dt class="text-sm text-content-primary break-words">{{ broker.name }}</dt>
              <dd class="text-sm text-content-secondary tabular-nums break-words">
                {{ formatUsageBytes(broker.upload_bytes) }} ·
                {{ broker.messages.toLocaleString() }} messages
              </dd>
            </div>
          </dl>
          <p v-if="!data.mqtt.brokers.length" class="text-sm text-content-muted mt-3">
            No MQTT payload samples in this window.
          </p>
        </div>
      </div>
    </template>
  </section>
</template>
