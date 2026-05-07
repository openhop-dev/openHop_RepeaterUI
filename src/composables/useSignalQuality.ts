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
const GOOD_SNR_MARGIN = 5.0; // dB above minimum for "good" signal

export interface SignalQuality {
  bars: number; // 0-5 signal bars
  color: string; // Tailwind color class
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
  const yellowThreshold = minSNR + GOOD_SNR_MARGIN; // 5 dB above minimum

  // Red: SNR <= minSNR (unreliable link)
  if (snr <= minSNR) {
    const bars = snr <= minSNR - 5 ? 0 : 1;
    return {
      bars,
      color: 'text-red-600 dark:text-red-400',
      snr,
      quality: bars === 0 ? 'None' : 'Poor',
    };
  }

  // Yellow: minSNR < SNR < (minSNR + 5 dB) (marginal link)
  if (snr < yellowThreshold) {
    // Linear interpolation between red and yellow zones
    const progress = (snr - minSNR) / GOOD_SNR_MARGIN;
    const bars = progress < 0.5 ? 2 : 3;
    return {
      bars,
      color:
        bars === 2
          ? 'text-orange-600 dark:text-orange-400'
          : 'text-yellow-600 dark:text-yellow-400',
      snr,
      quality: 'Fair',
    };
  }

  // Green: SNR >= (minSNR + 5 dB) (reliable link)
  // Scale bars 4-5 based on how much above good threshold
  const excessSNR = snr - yellowThreshold;
  const bars = excessSNR >= 10 ? 5 : 4;
  return {
    bars,
    color: bars === 5 ? 'text-green-600 dark:text-green-400' : 'text-green-600 dark:text-green-300',
    snr,
    quality: bars === 5 ? 'Excellent' : 'Good',
  };
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

  return {
    getSignalQuality,
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
