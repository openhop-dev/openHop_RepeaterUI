import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import ApiService from '@/utils/api';

export interface Advert {
  id: number;
  timestamp: number;
  pubkey: string;
  node_name: string | null;
  is_repeater: boolean;
  route_type: number | null;
  contact_type: string;
  latitude: number | null;
  longitude: number | null;
  first_seen: number;
  last_seen: number;
  rssi: number | null;
  snr: number | null;
  advert_count: number;
  is_new_neighbor: boolean;
  zero_hop: boolean;
}

export const CONTACT_TYPE_MAP = {
  0: 'Unknown',
  1: 'Chat Node',
  2: 'Repeater',
  3: 'Room Server',
  4: 'Hybrid Node',
} as const;

export const useNeighborStore = defineStore('neighbors', () => {
  const advertsByType = ref<Record<string, Advert[]>>({});
  const isLoading = ref(false);
  const lastFetched = ref<number | null>(null);
  const currentHours = ref(48);

  const allAdverts = computed(() => Object.values(advertsByType.value).flat());
  const totalCount = computed(() => allAdverts.value.length);

  function isStale(ttlMs = 10 * 60_000): boolean {
    if (lastFetched.value === null) return true;
    return Date.now() - lastFetched.value > ttlMs;
  }

  async function fetchAll(hours = currentHours.value): Promise<void> {
    isLoading.value = true;
    currentHours.value = hours;

    const entries = Object.entries(CONTACT_TYPE_MAP) as [string, string][];

    const results = await Promise.allSettled(
      entries.map(async ([typeKey, typeName]) => {
        try {
          const response = await ApiService.get(
            `/adverts_by_contact_type?contact_type=${encodeURIComponent(typeName)}&hours=${hours}`,
          );
          return {
            typeKey,
            adverts: response.success && Array.isArray(response.data) ? (response.data as Advert[]) : [],
          };
        } catch {
          return { typeKey, adverts: [] as Advert[] };
        }
      }),
    );

    const next: Record<string, Advert[]> = {};
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.adverts.length > 0) {
        next[result.value.typeKey] = result.value.adverts;
      }
    }
    advertsByType.value = next;
    lastFetched.value = Date.now();
    isLoading.value = false;
  }

  function reset(): void {
    advertsByType.value = {};
    isLoading.value = false;
    lastFetched.value = null;
    currentHours.value = 48;
  }

  return {
    advertsByType,
    isLoading,
    lastFetched,
    currentHours,
    allAdverts,
    totalCount,
    isStale,
    fetchAll,
    reset,
  };
});
