<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import ApiService from '@/utils/api';
import type { RecentPacket } from '@/types/api';
import PacketDetailsModal from '@/components/modals/PacketDetailsModal.vue';

interface Incident {
  id: string;
  startMs: number;
  endMs: number;
  peakNoiseDelta: number;
  totalCrc: number;
  totalDrops: number;
  severity: 'low' | 'medium' | 'high';
}

interface Props {
  incident: Incident | null;
}

const props = withDefaults(defineProps<Props>(), {
  incident: null,
});

const emit = defineEmits<{
  close: [];
}>();

const contextWindowOptions = Array.from({ length: 15 }, (_, i) => i + 1);
const contextWindowSeconds = ref<number>(10);
const nearbyPackets = ref<RecentPacket[]>([]);
const nearbyLoading = ref(false);
const nearbyError = ref<string | null>(null);
const selectedPacket = ref<RecentPacket | null>(null);
const isPacketDetailsOpen = ref(false);

const formatTime = (ms: number): string => {
  const date = new Date(ms);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const formatDuration = (startMs: number, endMs: number): string => {
  const duration = Math.max(0, endMs - startMs);
  const seconds = Math.floor(duration / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
};

const incidentDetails = computed(() => {
  if (!props.incident) return null;
  const inc = props.incident;
  return {
    startTime: formatTime(inc.startMs),
    endTime: formatTime(inc.endMs),
    duration: formatDuration(inc.startMs, inc.endMs),
    peakNoise: inc.peakNoiseDelta.toFixed(2),
    totalCrc: inc.totalCrc.toLocaleString(),
    severityColor:
      inc.severity === 'high'
        ? 'bg-danger/10 text-danger'
        : inc.severity === 'medium'
          ? 'bg-warning/10 text-warning'
          : 'bg-success/10 text-success',
  };
});

const incidentWindow = computed(() => {
  if (!props.incident) return null;
  const startTs = Math.floor(props.incident.startMs / 1000) - contextWindowSeconds.value;
  const endTs = Math.ceil(props.incident.endMs / 1000) + contextWindowSeconds.value;
  return {
    startTs,
    endTs,
    contextSeconds: contextWindowSeconds.value,
  };
});

const toPacketMillis = (timestamp: number): number => {
  return timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
};

const formatPacketTime = (timestamp: number): string => {
  return new Date(toPacketMillis(timestamp)).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const packetTypeName = (type: number): string => {
  const labels: Record<number, string> = {
    0: 'REQ',
    1: 'RESP',
    2: 'MSG',
    3: 'ACK',
    4: 'ADVERT',
    5: 'GRP_TXT',
    6: 'GRP_DATA',
    7: 'ANON_REQ',
    8: 'PATH',
    9: 'TRACE',
    10: 'MP',
    15: 'CUSTOM',
  };
  return labels[type] ?? `T${type}`;
};

const routeName = (route: number): string => {
  const labels: Record<number, string> = {
    0: 'Transport Flood',
    1: 'Flood',
    2: 'Direct',
    3: 'Transport Direct',
  };
  return labels[route] ?? `Route ${route}`;
};

const packetStatus = (packet: RecentPacket): string => {
  if (packet.is_duplicate) return 'Duplicate';
  if (!packet.transmitted || packet.drop_reason) return 'Dropped';
  return 'Forwarded';
};

const asPathArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === 'string');
    } catch {
      return [];
    }
  }
  return [];
};

const packetPathSummary = (packet: RecentPacket): string => {
  const original = asPathArray(packet.original_path).length;
  const forwarded = asPathArray(packet.forwarded_path).length;
  if (!original && !forwarded) return 'No path';
  if (original && forwarded) return `${original}->${forwarded} hops`;
  return `${Math.max(original, forwarded)} hops`;
};

const nearbySummary = computed(() => {
  const packets = nearbyPackets.value;
  const dropped = packets.filter((p) => !p.transmitted || !!p.drop_reason).length;
  const duplicates = packets.filter((p) => !!p.is_duplicate).length;
  const withPath = packets.filter((p) => asPathArray(p.original_path).length > 0 || asPathArray(p.forwarded_path).length > 0).length;

  const reasons = new Map<string, number>();
  for (const packet of packets) {
    if (!packet.drop_reason) continue;
    reasons.set(packet.drop_reason, (reasons.get(packet.drop_reason) ?? 0) + 1);
  }
  const topDropReasons = Array.from(reasons.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([reason, count]) => `${reason} (${count})`);

  return {
    total: packets.length,
    dropped,
    duplicates,
    withPath,
    topDropReasons,
  };
});

const nearbyPacketsPreview = computed(() => {
  return [...nearbyPackets.value]
    .sort((a, b) => toPacketMillis(a.timestamp) - toPacketMillis(b.timestamp))
    .slice(0, 20);
});

const packetPathSignature = (packet: RecentPacket): string => {
  const original = asPathArray(packet.original_path).join('>');
  const forwarded = asPathArray(packet.forwarded_path).join('>');
  return `${original}|${forwarded}`;
};

const overlapGroups = computed(() => {
  const byHash = new Map<string, { count: number; samples: RecentPacket[] }>();
  const byPath = new Map<string, { count: number; samples: RecentPacket[] }>();

  for (const packet of nearbyPackets.value) {
    const hashKey = packet.packet_hash || 'unknown';
    const hashGroup = byHash.get(hashKey) ?? { count: 0, samples: [] };
    hashGroup.count += 1;
    if (hashGroup.samples.length < 3) hashGroup.samples.push(packet);
    byHash.set(hashKey, hashGroup);

    const pathKey = packetPathSignature(packet);
    if (!pathKey || pathKey === '|') continue;
    const pathGroup = byPath.get(pathKey) ?? { count: 0, samples: [] };
    pathGroup.count += 1;
    if (pathGroup.samples.length < 3) pathGroup.samples.push(packet);
    byPath.set(pathKey, pathGroup);
  }

  const repeatedHashes = Array.from(byHash.entries())
    .filter(([, group]) => group.count > 1)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 6)
    .map(([hash, group]) => ({ hash, count: group.count, samples: group.samples }));

  const repeatedPaths = Array.from(byPath.entries())
    .filter(([, group]) => group.count > 1)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 6)
    .map(([path, group]) => ({ path, count: group.count, samples: group.samples }));

  return {
    repeatedHashes,
    repeatedPaths,
  };
});

const openPacketDetails = async (packet: RecentPacket) => {
  selectedPacket.value = packet;
  isPacketDetailsOpen.value = true;

  if (packet.packet_hash && (!packet.header || !packet.raw_packet)) {
    try {
      const response = await ApiService.get<RecentPacket>('/packet_by_hash', {
        packet_hash: packet.packet_hash,
      });
      if (response.data && selectedPacket.value?.packet_hash === packet.packet_hash) {
        selectedPacket.value = { ...selectedPacket.value, ...response.data };
      }
    } catch {
      // Non-fatal. PacketDetailsModal can render partial packet data.
    }
  }
};

const closePacketDetails = () => {
  isPacketDetailsOpen.value = false;
  selectedPacket.value = null;
};

const loadNearbyPackets = async () => {
  if (!incidentWindow.value) {
    nearbyPackets.value = [];
    return;
  }

  nearbyLoading.value = true;
  nearbyError.value = null;
  try {
    const response = await ApiService.get<RecentPacket[]>('/filtered_packets', {
      start_timestamp: incidentWindow.value.startTs,
      end_timestamp: incidentWindow.value.endTs,
      limit: 250,
    });
    nearbyPackets.value = Array.isArray(response.data) ? response.data : [];
  } catch (err) {
    nearbyPackets.value = [];
    nearbyError.value = err instanceof Error ? err.message : 'Failed to load packet context';
  } finally {
    nearbyLoading.value = false;
  }
};

watch(
  () => props.incident?.id,
  async (id) => {
    if (!id) {
      nearbyPackets.value = [];
      nearbyError.value = null;
      return;
    }
    await loadNearbyPackets();
  },
  { immediate: true },
);

watch(contextWindowSeconds, async () => {
  if (!props.incident) return;
  await loadNearbyPackets();
});

const handleBackdropClick = (event: MouseEvent) => {
  if (event.target === event.currentTarget) {
    emit('close');
  }
};
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="incident"
        class="modal-backdrop"
        @click="handleBackdropClick"
      >
        <div
          class="modal-card-glass max-w-2xl overflow-hidden"
          @click.stop
        >
          <!-- Header -->
          <div class="bg-gradient-to-r from-accent-amber/20 to-accent-red/20 border-b border-stroke-subtle dark:border-stroke/10 px-6 py-4">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="p-2 bg-accent-amber/20 rounded-lg">
                  <svg class="w-5 h-5 text-accent-amber" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <h2 class="text-xl font-bold text-content-primary">RF Degradation Event</h2>
                  <p class="text-sm text-content-secondary dark:text-content-muted">{{ incidentDetails?.startTime }}</p>
                </div>
              </div>
              <button
                @click="emit('close')"
                class="p-2 hover:bg-stroke-subtle dark:hover:bg-white/10 rounded-lg transition-colors text-content-secondary dark:text-content-muted hover:text-content-primary dark:hover:text-content-primary"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          <div class="max-h-[75vh] overflow-y-auto">

          <!-- Content -->
          <div class="px-6 py-4 space-y-6">
            <!-- Severity Badge -->
            <div class="flex items-center gap-3">
              <div
                :class="[
                  'px-4 py-2 rounded-lg font-medium text-sm',
                  incidentDetails?.severityColor,
                ]"
              >
                Severity: {{ incident.severity.toUpperCase() }}
              </div>
            </div>

            <!-- Time Window -->
            <div class="grid grid-cols-2 gap-4">
              <div class="bg-surface-primary rounded-lg p-4">
                <div class="text-xs text-content-tertiary uppercase tracking-wide mb-1">Start Time</div>
                <div class="text-content-primary font-medium">{{ incidentDetails?.startTime }}</div>
              </div>
              <div class="bg-surface-primary rounded-lg p-4">
                <div class="text-xs text-content-tertiary uppercase tracking-wide mb-1">End Time</div>
                <div class="text-content-primary font-medium">{{ incidentDetails?.endTime }}</div>
              </div>
            </div>

            <!-- Duration -->
            <div class="bg-surface-primary rounded-lg p-4">
              <div class="text-xs text-content-tertiary uppercase tracking-wide mb-1">Duration</div>
              <div class="text-2xl text-content-primary font-semibold">{{ incidentDetails?.duration }}</div>
            </div>

            <!-- Metrics Grid -->
            <div class="grid grid-cols-2 gap-4">
              <div class="bg-surface-primary rounded-lg p-4 border-l-4 border-accent-red">
                <div class="text-xs text-content-tertiary uppercase tracking-wide mb-1">Peak Noise Delta</div>
                <div class="text-3xl text-accent-red font-bold">+{{ incidentDetails?.peakNoise }}</div>
                <div class="text-xs text-content-secondary mt-1">dB above baseline</div>
              </div>
              <div class="bg-surface-primary rounded-lg p-4 border-l-4 border-accent-amber">
                <div class="text-xs text-content-tertiary uppercase tracking-wide mb-1">Total CRC Errors</div>
                <div class="text-3xl text-accent-amber font-bold">{{ incidentDetails?.totalCrc }}</div>
                <div class="text-xs text-content-secondary mt-1">detected during event</div>
              </div>
            </div>

            <!-- Correlation Info -->
            <div class="bg-surface-primary rounded-lg p-4">
              <div class="text-sm font-medium text-content-primary mb-3">What This Means</div>
              <ul class="space-y-2 text-sm text-content-secondary">
                <li class="flex gap-2">
                  <span class="text-sky-500 font-bold">•</span>
                  <span>Noise floor increased {{ incidentDetails?.peakNoise }} dB above baseline, indicating RF interference or environmental factors.</span>
                </li>
                <li class="flex gap-2">
                  <span class="text-accent-amber font-bold">•</span>
                  <span>{{ incidentDetails?.totalCrc }} CRC errors occurred during this period, suggesting packet corruption.</span>
                </li>
                <li class="flex gap-2">
                  <span class="text-content-tertiary font-bold">•</span>
                  <span>The strong correlation between noise and CRC errors indicates the noise floor was the primary cause of packet degradation.</span>
                </li>
              </ul>
            </div>

            <!-- Packet Context -->
            <div class="bg-surface-primary rounded-lg p-4">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <div class="text-sm font-medium text-content-primary">Packet Context Around Incident</div>
                  <div class="text-xs text-content-secondary mt-1">
                    ±{{ incidentWindow?.contextSeconds ?? 0 }}s around window
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <select
                    v-model.number="contextWindowSeconds"
                    class="px-2 py-1 text-xs rounded-md border border-stroke-subtle bg-background-mute text-content-primary"
                  >
                    <option
                      v-for="seconds in contextWindowOptions"
                      :key="seconds"
                      :value="seconds"
                    >
                      ±{{ seconds }}s
                    </option>
                  </select>
                  <button
                    class="px-2 py-1 text-xs rounded-md border border-stroke-subtle text-content-secondary hover:text-content-primary hover:bg-surface-hover"
                    @click="loadNearbyPackets"
                  >
                    Refresh
                  </button>
                </div>
              </div>

              <div v-if="nearbyLoading" class="text-sm text-content-secondary mt-3">Loading nearby packets...</div>
              <div v-else-if="nearbyError" class="text-sm text-danger mt-3">{{ nearbyError }}</div>
              <div v-else class="mt-3 space-y-3">
                <div class="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div class="rounded-md border border-stroke-subtle px-2 py-2">
                    <div class="text-content-tertiary">Total</div>
                    <div class="text-content-primary font-semibold">{{ nearbySummary.total }}</div>
                  </div>
                  <div class="rounded-md border border-stroke-subtle px-2 py-2">
                    <div class="text-content-tertiary">Dropped</div>
                    <div class="text-content-primary font-semibold">{{ nearbySummary.dropped }}</div>
                  </div>
                  <div class="rounded-md border border-stroke-subtle px-2 py-2">
                    <div class="text-content-tertiary">Duplicates</div>
                    <div class="text-content-primary font-semibold">{{ nearbySummary.duplicates }}</div>
                  </div>
                  <div class="rounded-md border border-stroke-subtle px-2 py-2">
                    <div class="text-content-tertiary">With path data</div>
                    <div class="text-content-primary font-semibold">{{ nearbySummary.withPath }}</div>
                  </div>
                </div>

                <div class="text-xs text-content-secondary">
                  <span class="font-medium text-content-primary">Top drop reasons:</span>
                  {{ nearbySummary.topDropReasons.length ? nearbySummary.topDropReasons.join(', ') : 'None' }}
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div class="rounded-md border border-stroke-subtle p-3">
                    <div class="text-xs font-semibold text-content-tertiary uppercase tracking-wide mb-2">
                      Repeated Packet Hashes
                    </div>
                    <div v-if="overlapGroups.repeatedHashes.length === 0" class="text-xs text-content-secondary">
                      No repeated hashes in this window.
                    </div>
                    <div v-else class="space-y-1.5">
                      <div
                        v-for="group in overlapGroups.repeatedHashes"
                        :key="group.hash"
                        class="text-xs text-content-secondary"
                      >
                        <span class="font-medium text-content-primary">{{ group.hash }}</span>
                        x{{ group.count }}
                      </div>
                    </div>
                  </div>

                  <div class="rounded-md border border-stroke-subtle p-3">
                    <div class="text-xs font-semibold text-content-tertiary uppercase tracking-wide mb-2">
                      Repeated Paths
                    </div>
                    <div v-if="overlapGroups.repeatedPaths.length === 0" class="text-xs text-content-secondary">
                      No repeated paths in this window.
                    </div>
                    <div v-else class="space-y-1.5">
                      <div
                        v-for="group in overlapGroups.repeatedPaths"
                        :key="group.path"
                        class="text-xs text-content-secondary truncate"
                        :title="group.path"
                      >
                        <span class="font-medium text-content-primary">{{ group.path }}</span>
                        x{{ group.count }}
                      </div>
                    </div>
                  </div>
                </div>

                <div class="glass-card border border-stroke-subtle dark:border-stroke rounded-xl overflow-hidden">
                  <div class="hidden md:grid grid-cols-12 gap-2 px-3 py-2 border-b border-stroke-subtle dark:border-stroke text-content-secondary dark:text-content-muted text-[11px] font-semibold uppercase tracking-wide">
                    <div class="col-span-2">Time</div>
                    <div class="col-span-2">Type</div>
                    <div class="col-span-2">Status</div>
                    <div class="col-span-4">Route / Path / Reason</div>
                    <div class="col-span-2 text-right">Inspect</div>
                  </div>

                  <div v-if="nearbyPacketsPreview.length === 0" class="px-3 py-3 text-sm text-content-secondary">
                    No packets found in this context window.
                  </div>

                  <div v-else class="max-h-56 overflow-y-auto">
                    <div
                      v-for="packet in nearbyPacketsPreview"
                      :key="`${packet.packet_hash}-${packet.timestamp}`"
                      class="packet-context-row grid grid-cols-1 md:grid-cols-12 gap-2 px-3 py-2 border-b border-stroke-subtle dark:border-dark-border/50 hover:bg-background-mute dark:hover:bg-stroke/5 transition-colors duration-150"
                    >
                      <div class="md:col-span-2 text-content-secondary text-xs">
                        <span class="md:hidden text-content-tertiary font-semibold uppercase tracking-wide mr-1">Time:</span>
                        {{ formatPacketTime(packet.timestamp) }}
                      </div>

                      <div class="md:col-span-2 text-content-primary text-xs font-medium">
                        <span class="md:hidden text-content-tertiary font-semibold uppercase tracking-wide mr-1">Type:</span>
                        {{ packetTypeName(packet.type) }}
                      </div>

                      <div
                        class="md:col-span-2 text-xs font-medium"
                        :class="{
                          'text-warning': packetStatus(packet) === 'Duplicate',
                          'text-danger': packetStatus(packet) === 'Dropped',
                          'text-success': packetStatus(packet) === 'Forwarded',
                        }"
                      >
                        <span class="md:hidden text-content-tertiary font-semibold uppercase tracking-wide mr-1">Status:</span>
                        {{ packetStatus(packet) }}
                      </div>

                      <div
                        class="md:col-span-4 text-content-secondary text-xs truncate"
                        :title="`${routeName(packet.route)} | ${packetPathSummary(packet)} | ${packet.drop_reason ?? 'no drop reason'}`"
                      >
                        <span class="md:hidden text-content-tertiary font-semibold uppercase tracking-wide mr-1">Details:</span>
                        {{ routeName(packet.route) }} | {{ packetPathSummary(packet) }} | {{ packet.drop_reason ?? 'ok' }}
                      </div>

                      <div class="md:col-span-2 md:text-right">
                        <button
                          class="glass-card border border-stroke-subtle dark:border-stroke hover:border-primary dark:hover:border-primary rounded-lg px-2 py-1 text-[11px] text-content-primary hover:text-primary hover:bg-primary/5 transition-all duration-200 focus:outline-none focus:ring-1 focus:ring-primary/20"
                          @click="openPacketDetails(packet)"
                        >
                          Open
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          </div>
          <!-- Footer -->
          <div class="border-t border-stroke-subtle dark:border-stroke/10 px-6 py-4">
            <div class="modal-actions">
              <button type="button" class="modal-btn-primary" @click="emit('close')">Close</button>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <PacketDetailsModal
      :packet="selectedPacket"
      :is-open="isPacketDetailsOpen"
      @close="closePacketDetails"
    />
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
