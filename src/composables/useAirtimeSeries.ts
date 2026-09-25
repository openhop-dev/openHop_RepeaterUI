/**
 * Shared shaping for the airtime utilization chart.
 *
 * Kept out of the components because every radio panel must be built the same
 * way: same bucket grid, same EMA half-life, same downsampling. Two panels that
 * were smoothed differently could not be compared, which is the whole point of
 * showing both sides of a Fabric bridge.
 */

export interface UtilSample {
  /** Unix timestamp (seconds) of the bucket this sample covers */
  timestamp: number;
  /** RX utilization percentage for this bucket */
  rxUtil: number;
  /** TX utilization percentage for this bucket */
  txUtil: number;
}

export interface AirtimeBucket {
  timestamp: number;
  rx_ms: number;
  tx_ms: number;
  rx_count: number;
  tx_count: number;
}

import type { RadioAirtimeProfile } from './useRadioProfiles';

export {
  formatBandwidth,
  formatCodingRate,
  formatFrequency,
  formatModulation,
  formatModulationDetail,
  hasCompleteProfile,
  profileSignature,
  type RadioAirtimeProfile,
} from './useRadioProfiles';

export interface RadioAirtimeSeries {
  radio_id: string;
  profile?: RadioAirtimeProfile | null;
  buckets: AirtimeBucket[];
  rx_total: number;
  tx_total: number;
}

/** Response body of `/airtime_chart_data`. `radios` is absent on older backends. */
export interface AirtimeChartPayload {
  bucket_seconds: number;
  buckets: AirtimeBucket[];
  rx_total: number;
  tx_total: number;
  radios?: RadioAirtimeSeries[];
  unattributed_rx_count?: number;
  unattributed_tx_count?: number;
}

export interface RadioPanelData {
  radioId: string;
  profile: RadioAirtimeProfile | null;
  samples: UtilSample[];
  rxTotal: number;
  txTotal: number;
  peakUtil: number;
  /** Full-scale percentage for this panel's Y axis */
  yAxisMax: number;
}

export interface SeriesGrid {
  startTime: number;
  bucketSeconds: number;
  bucketCount: number;
}

/** EMA half-life in samples. 10 samples = 10 minutes at 60-second buckets. */
export const EMA_HALF_LIFE_SAMPLES = 10;
/** Target point count after downsampling, chosen for canvas render cost. */
export const DOWNSAMPLE_TARGET_POINTS = 400;

/**
 * Fill a dense sample array over the whole window, so gaps read as 0% rather
 * than as a straight line between distant buckets.
 */
export function bucketsToSamples(buckets: AirtimeBucket[], grid: SeriesGrid): UtilSample[] {
  const { startTime, bucketSeconds, bucketCount } = grid;
  const bucketMs = bucketSeconds * 1000;
  const rxUtil = new Float64Array(bucketCount);
  const txUtil = new Float64Array(bucketCount);

  for (const bucket of buckets ?? []) {
    const idx = Math.floor((bucket.timestamp - startTime) / bucketSeconds);
    if (idx >= 0 && idx < bucketCount) {
      rxUtil[idx] = ((bucket.rx_ms || 0) / bucketMs) * 100;
      txUtil[idx] = ((bucket.tx_ms || 0) / bucketMs) * 100;
    }
  }

  const samples: UtilSample[] = new Array(bucketCount);
  for (let i = 0; i < bucketCount; i++) {
    samples[i] = {
      timestamp: startTime + i * bucketSeconds,
      rxUtil: rxUtil[i],
      txUtil: txUtil[i],
    };
  }
  return samples;
}

/**
 * Exponential moving average: a smooth trend line that still responds to
 * change. EMA_t = alpha * value_t + (1 - alpha) * EMA_(t-1).
 */
export function applyEmaSmoothing(
  samples: UtilSample[],
  halfLifeSamples = EMA_HALF_LIFE_SAMPLES,
): UtilSample[] {
  if (samples.length === 0) return [];

  const alpha = 1 - Math.pow(0.5, 1 / halfLifeSamples);

  // Seed from the first window's mean so the line does not start at zero and
  // climb for the first hour of a busy day.
  const initWindow = Math.min(samples.length, Math.max(10, Math.floor(halfLifeSamples / 3)));
  let rxEma = 0;
  let txEma = 0;
  for (let i = 0; i < initWindow; i++) {
    rxEma += samples[i].rxUtil;
    txEma += samples[i].txUtil;
  }
  rxEma /= initWindow;
  txEma /= initWindow;

  return samples.map((s) => {
    rxEma = alpha * s.rxUtil + (1 - alpha) * rxEma;
    txEma = alpha * s.txUtil + (1 - alpha) * txEma;
    return { ...s, rxUtil: rxEma, txUtil: txEma };
  });
}

/** Mean-downsample to roughly `target` points, preserving bucket timestamps. */
export function downsample(samples: UtilSample[], target = DOWNSAMPLE_TARGET_POINTS): UtilSample[] {
  const step = Math.max(1, Math.floor(samples.length / target));
  if (step === 1) return samples;

  const out: UtilSample[] = [];
  for (let i = 0; i < samples.length; i += step) {
    let sumRx = 0;
    let sumTx = 0;
    let count = 0;
    const end = Math.min(i + step, samples.length);
    for (let j = i; j < end; j++) {
      sumRx += samples[j].rxUtil;
      sumTx += samples[j].txUtil;
      count++;
    }
    out.push({ timestamp: samples[i].timestamp, rxUtil: sumRx / count, txUtil: sumTx / count });
  }
  return out;
}

/** Bucket grid -> dense samples -> EMA -> downsample, identically for every radio. */
export function shapeSeries(buckets: AirtimeBucket[], grid: SeriesGrid): UtilSample[] {
  return downsample(applyEmaSmoothing(bucketsToSamples(buckets, grid)));
}

/** Highest smoothed utilization across both series of one panel. */
export function peakUtilization(samples: UtilSample[]): number {
  let peak = 0;
  for (const s of samples) {
    if (s.rxUtil > peak) peak = s.rxUtil;
    if (s.txUtil > peak) peak = s.txUtil;
  }
  return peak;
}

/**
 * Full-scale values that divide into five exact gridline labels, so an axis
 * never reads 7.4999%. Scaled by decade to cover 0.1% through 100%.
 */
const NICE_AXIS_STEPS = [1, 1.5, 2, 3, 4, 5, 7.5, 10];
/** Never zoom in past this, or an idle radio's noise fills the frame. */
const MIN_Y_AXIS_MAX = 1;

/**
 * Y-axis maximum for one panel, with 10% headroom above its own peak.
 *
 * Each panel scales to itself. On a bridge whose two radios run different
 * bandwidths the slower one carries an order of magnitude more airtime for the
 * same traffic, and a scale shared with it flattens the faster radio into the
 * baseline. The axis labels carry the comparison instead.
 */
export function panelYAxisMax(samples: UtilSample[]): number {
  const target = Math.max(peakUtilization(samples) * 1.1, MIN_Y_AXIS_MAX);
  const decade = Math.pow(10, Math.floor(Math.log10(target)));
  for (const step of NICE_AXIS_STEPS) {
    const candidate = step * decade;
    if (candidate >= target) return candidate;
  }
  return 10 * decade;
}

/** Decimal places that render every gridline label of this axis exactly. */
export function axisLabelDecimals(yAxisMax: number, divisions = 5): number {
  const increment = yAxisMax / divisions;
  if (Number.isInteger(increment)) return 0;
  return increment >= 0.1 ? 1 : 2;
}

/**
 * Normalize a response into per-radio panels.
 *
 * A backend that predates per-radio attribution sends only the combined
 * `buckets`, so synthesize a single panel from it and label it with whatever
 * the caller knows about the one radio. Never split a legacy series across two
 * radios: the response does not say which packet was on which.
 */
export function toRadioPanels(
  payload: AirtimeChartPayload,
  grid: SeriesGrid,
  fallback: { radioId: string; profile: RadioAirtimeProfile | null },
): RadioPanelData[] {
  const radios = Array.isArray(payload?.radios) ? payload.radios : [];

  if (radios.length === 0) {
    const samples = shapeSeries(payload?.buckets ?? [], grid);
    return [
      {
        radioId: fallback.radioId,
        profile: fallback.profile,
        samples,
        rxTotal: payload?.rx_total ?? 0,
        txTotal: payload?.tx_total ?? 0,
        peakUtil: peakUtilization(samples),
        yAxisMax: panelYAxisMax(samples),
      },
    ];
  }

  return radios.map((radio) => {
    const samples = shapeSeries(radio.buckets ?? [], grid);
    return {
      radioId: String(radio.radio_id ?? fallback.radioId),
      profile: radio.profile ?? null,
      samples,
      rxTotal: radio.rx_total ?? 0,
      txTotal: radio.tx_total ?? 0,
      peakUtil: peakUtilization(samples),
      yAxisMax: panelYAxisMax(samples),
    };
  });
}
