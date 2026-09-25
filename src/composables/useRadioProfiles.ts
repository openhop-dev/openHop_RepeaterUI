/**
 * The radios this node has, and how to name them.
 *
 * Every view that splits data per radio reads its radio list from here, so a
 * radio is identified and labelled the same way on the Dashboard airtime card,
 * Statistics, Neighbour Links and RF Health.
 */
import { computed, inject, ref } from 'vue';
import { routeLocationKey, routerKey } from 'vue-router';
import { useMultiRadioConfig } from '@/composables/useMultiRadioConfig';
import { useSystemStore } from '@/stores/system';

export interface RadioAirtimeProfile {
  frequency_hz?: number | null;
  bandwidth_hz?: number | null;
  spreading_factor?: number | null;
  coding_rate?: number | null;
  preamble_length?: number | null;
}

export interface RadioIdentity {
  radioId: string;
  profile: RadioAirtimeProfile | null;
}

/** Radio scope meaning every radio combined. */
export const ALL_RADIOS = 'all';

/** True when every field needed to describe the modulation is present. */
export function hasCompleteProfile(profile: RadioAirtimeProfile | null | undefined): boolean {
  if (!profile) return false;
  return (
    profile.spreading_factor != null && profile.bandwidth_hz != null && profile.coding_rate != null
  );
}

/** "869.618 MHz", or null when the frequency is unknown. */
export function formatFrequency(hz: number | null | undefined): string | null {
  if (hz == null || !Number.isFinite(hz)) return null;
  return `${(hz / 1e6).toFixed(3)} MHz`;
}

/** "62.5 kHz" / "250 kHz". */
export function formatBandwidth(hz: number | null | undefined): string | null {
  if (hz == null || !Number.isFinite(hz)) return null;
  const khz = hz / 1000;
  return `${Number.isInteger(khz) ? khz : khz.toFixed(1)} kHz`;
}

/**
 * "CR 4/8". The backend reports the denominator (5..8); older configs stored
 * the index form (1..4), which the radio driver reads as 4/(n+4).
 */
export function formatCodingRate(cr: number | null | undefined): string | null {
  if (cr == null || !Number.isFinite(cr)) return null;
  const denominator = cr >= 5 ? cr : cr + 4;
  return `CR 4/${denominator}`;
}

/** "SF8 · 62.5 kHz · CR 4/8", or null when the profile is incomplete. */
export function formatModulation(profile: RadioAirtimeProfile | null | undefined): string | null {
  if (!hasCompleteProfile(profile)) return null;
  return [
    `SF${profile!.spreading_factor}`,
    formatBandwidth(profile!.bandwidth_hz),
    formatCodingRate(profile!.coding_rate),
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Modulation plus preamble, for the heading tooltip and screen readers. */
export function formatModulationDetail(
  profile: RadioAirtimeProfile | null | undefined,
): string | null {
  const base = formatModulation(profile);
  if (!base) return null;
  const preamble = profile?.preamble_length;
  return preamble == null ? base : `${base} · ${preamble} symbol preamble`;
}

/**
 * Signature of the air settings a set of panels was computed with. The cached
 * payload is only reusable while this still matches, so retuning a radio
 * redraws immediately instead of waiting out the data TTL.
 */
export function profileSignature(entries: RadioIdentity[]): string {
  return entries
    .map((entry) => {
      const p = entry.profile ?? {};
      return [
        entry.radioId,
        p.spreading_factor ?? '',
        p.bandwidth_hz ?? '',
        p.coding_rate ?? '',
        p.preamble_length ?? '',
        p.frequency_hz ?? '',
      ].join(':');
    })
    .join('|');
}

/** Air settings from a config `radio:` section; a field that is not a number is null. */
export function toAirProfile(
  air: Record<string, unknown> | undefined | null,
): RadioAirtimeProfile | null {
  if (!air || typeof air !== 'object') return null;
  const num = (value: unknown): number | null => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  return {
    frequency_hz: num(air.frequency),
    bandwidth_hz: num(air.bandwidth),
    spreading_factor: num(air.spreading_factor),
    coding_rate: num(air.coding_rate),
    preamble_length: num(air.preamble_length),
  };
}

export function useRadioProfiles() {
  const systemStore = useSystemStore();
  const { radios: configuredRadios, rootConfig, defaultRadioId } = useMultiRadioConfig();

  /**
   * What the client believes is on the air, from /stats. Names the radios and
   * labels a legacy single-radio response; the server decides which profile its
   * per-radio figures are computed with.
   */
  const profiles = computed<RadioIdentity[]>(() => {
    const reported = (systemStore.stats as Record<string, unknown> | null)?.radio_profiles;
    if (Array.isArray(reported) && reported.length) {
      return (reported as (RadioAirtimeProfile & { radio_id?: string })[]).map((entry) => ({
        radioId: String(entry.radio_id ?? defaultRadioId.value),
        profile: {
          frequency_hz: entry.frequency_hz ?? null,
          bandwidth_hz: entry.bandwidth_hz ?? null,
          spreading_factor: entry.spreading_factor ?? null,
          coding_rate: entry.coding_rate ?? null,
          preamble_length: entry.preamble_length ?? null,
        },
      }));
    }

    if (configuredRadios.value.length) {
      return configuredRadios.value.map((radio) => ({
        radioId: radio.id,
        profile: toAirProfile(radio.radio as Record<string, unknown> | undefined),
      }));
    }

    return [
      {
        radioId: defaultRadioId.value,
        profile: toAirProfile(rootConfig.value.radio as Record<string, unknown> | undefined),
      },
    ];
  });

  const isMultiRadio = computed(() => profiles.value.length > 1);

  return { profiles, isMultiRadio, defaultRadioId };
}

/**
 * The radio scope a view shows: every radio combined, or one radio. Always All
 * radios on a single-radio node, and falls back to All radios when the selected
 * radio is no longer configured. Kept in `?radio=` when the app has a router, so
 * a reload, a shared link or the back button keeps the radio.
 *
 * `requireRadio` is for views where All radios is not a meaningful answer: RF
 * Health correlates one receiver's noise floor with its own CRC errors and
 * contention, and pairing one radio's noise with another's errors is a
 * correlation between two unrelated channels. Such a view falls back to the
 * default radio rather than to All. It changes nothing on a single-radio node,
 * whose samples carry no radio id and so must never be filtered by one.
 */
export function useRadioScope(options?: { requireRadio?: boolean }) {
  const radioProfiles = useRadioProfiles();
  const route = inject(routeLocationKey, null);
  const router = inject(routerKey, null);
  const localSelection = ref<string>(ALL_RADIOS);

  const requested = computed(() => {
    if (!route || !router) return localSelection.value;
    const value = route.query.radio;
    return typeof value === 'string' && value ? value : ALL_RADIOS;
  });

  const fallback = computed(() => {
    if (!options?.requireRadio) return ALL_RADIOS;
    const ids = radioProfiles.profiles.value.map((entry) => entry.radioId);
    const preferred = radioProfiles.defaultRadioId.value;
    return ids.includes(preferred) ? preferred : (ids[0] ?? ALL_RADIOS);
  });

  const scope = computed<string>({
    get() {
      if (!radioProfiles.isMultiRadio.value) return ALL_RADIOS;
      const ids = radioProfiles.profiles.value.map((entry) => entry.radioId);
      return ids.includes(requested.value) ? requested.value : fallback.value;
    },
    set(value) {
      if (!route || !router) {
        localSelection.value = value;
        return;
      }
      const query = { ...route.query };
      if (value === ALL_RADIOS) delete query.radio;
      else query.radio = value;
      void router.replace({ query });
    },
  });

  return { ...radioProfiles, scope };
}
