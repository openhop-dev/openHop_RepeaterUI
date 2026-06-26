/**
 * Signal Quality Utilities - SNR-based RSSI color mapping
 *
 * Provides accurate link reliability assessment based on SNR relative to
 * spreading factor requirements, rather than absolute RSSI values.
 */

import { computed } from 'vue';
import { useSystemStore } from '@/stores/system';

// Minimum SNR thresholds for SX1262 LoRa radios by spreading factor
const MIN_SNR_BY_SF: Record<number, number> = {
  7: -7.5,
  8: -10.0,
  9: -12.5,
  10: -15.0,
  11: -17.5,
  12: -20.0,
};

// Default values for fallback
const DEFAULT_NOISE_FLOOR = -116.0; // Typical quiet RF environment
const DEFAULT_SF = 8;

// Signal bar scale: 20 dB range above minSNR, 4 dB per bar (bars 1–5)
// Bar 5 (full strength) kicks in at minSNR + 16 dB; anything above minSNR + 20 is comfortably full
const SNR_STEP = 4.0;
const SNR_STEPS = 5;

export interface SignalQuality {
  bars: number; // 0-5 signal bars
  color: string; // text-* Tailwind class — for text/icon colouring
  bgColor: string; // bg-* Tailwind class — for filled bar/chip colouring
  snr: number; // Calculated SNR
  quality: 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'None'; // Text label
}

/**
 * Calculate SNR from RSSI and noise floor
 */
function calculateSNR(rssi: number, noiseFloor: number): number {
  return rssi - noiseFloor;
}

/**
 * Get minimum SNR for a given spreading factor
 */
function getMinSNR(spreadingFactor: number): number {
  return MIN_SNR_BY_SF[spreadingFactor] ?? MIN_SNR_BY_SF[DEFAULT_SF];
}

/**
 * Map SNR to signal quality with color and bars
 */
function mapSNRToQuality(snr: number, minSNR: number): SignalQuality {
  // Below minimum — not reliably decodable
  if (snr < minSNR) {
    return {
      bars: 0,
      color: 'text-accent-red',
      bgColor: 'bg-accent-red',
      snr,
      quality: 'None',
    };
  }

  // 5 equal 4 dB steps above minSNR. bar = floor((snr - minSNR) / 4) + 1, capped at 5.
  const bars = Math.min(SNR_STEPS, Math.floor((snr - minSNR) / SNR_STEP) + 1) as 1 | 2 | 3 | 4 | 5;

  const BAR_STYLES: Record<1|2|3|4|5, { color: string; bgColor: string; quality: SignalQuality['quality'] }> = {
    1: { color: 'text-accent-red',         bgColor: 'bg-accent-red',         quality: 'Poor'      },
    2: { color: 'text-accent-orange',      bgColor: 'bg-accent-orange',      quality: 'Poor'      },
    3: { color: 'text-accent-amber',       bgColor: 'bg-accent-amber',       quality: 'Fair'      },
    4: { color: 'text-accent-green-light', bgColor: 'bg-accent-green-light', quality: 'Good'      },
    5: { color: 'text-accent-green',       bgColor: 'bg-accent-green',       quality: 'Excellent' },
  };
  return { bars, snr, ...BAR_STYLES[bars] };
}

/**
 * Composable for signal quality calculation
 * Returns a function that calculates signal quality from RSSI
 */
export function useSignalQuality() {
  const systemStore = useSystemStore();

  // Get current noise floor from system stats (with fallback)
  const noiseFloor = computed(() => systemStore.noiseFloorDbm ?? DEFAULT_NOISE_FLOOR);

  // Get current spreading factor from radio config (with fallback)
  const spreadingFactor = computed(
    () => systemStore.stats?.config?.radio?.spreading_factor ?? DEFAULT_SF,
  );

  // Get minimum SNR for current SF
  const minSNR = computed(() => getMinSNR(spreadingFactor.value));

  /**
   * Calculate signal quality from RSSI
   * @param rssi RSSI value in dBm (or null)
   * @returns Signal quality with bars, color, and SNR
   */
  const getSignalQuality = (rssi: number | null): SignalQuality => {
    // Handle null/invalid RSSI
    if (!rssi || rssi > 0 || rssi < -120) {
      return {
        bars: 0,
        color: 'text-gray-400 dark:text-gray-500',
        bgColor: 'bg-gray-400 dark:bg-gray-500',
        snr: -999,
        quality: 'None',
      };
    }

    // Calculate SNR
    const snr = calculateSNR(rssi, noiseFloor.value);

    // Clamp extreme values for sanity
    const clampedSNR = Math.max(-30, Math.min(20, snr));

    // Map to quality/color
    return mapSNRToQuality(clampedSNR, minSNR.value);
  };

  /**
   * Calculate signal quality directly from a pre-calculated SNR value
   * Use this when the packet already contains an SNR field.
   */
  const getSignalQualityFromSNR = (snr: number | null): SignalQuality => {
    if (snr === null || !Number.isFinite(snr)) {
      return {
        bars: 0,
        color: 'text-gray-400 dark:text-gray-500',
        bgColor: 'bg-gray-400 dark:bg-gray-500',
        snr: -999,
        quality: 'None',
      };
    }
    const clamped = Math.max(-30, Math.min(20, snr));
    return mapSNRToQuality(clamped, minSNR.value);
  };

  return {
    getSignalQuality,
    getSignalQualityFromSNR,
    noiseFloor,
    spreadingFactor,
    minSNR,
  };
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use useSignalQuality composable instead
 */
export function getRSSIStrength(rssi: number | null): { bars: number; color: string } {
  const systemStore = useSystemStore();
  const noiseFloor = systemStore.noiseFloorDbm ?? DEFAULT_NOISE_FLOOR;
  const sf = systemStore.stats?.config?.radio?.spreading_factor ?? DEFAULT_SF;
  const minSNR = getMinSNR(sf);

  if (!rssi || rssi > 0 || rssi < -120) {
    return { bars: 0, color: 'text-gray-400' };
  }

  const snr = calculateSNR(rssi, noiseFloor);
  const quality = mapSNRToQuality(snr, minSNR);

  return {
    bars: quality.bars,
    color: quality.color,
  };
}
