import ApiService from '@/utils/api';
import type { RadioFrontendSettings } from '@/generated/openapi';

// KISS modem RF front-end parameters, named as in the MeshCore CLI. They are read
// from and applied to the modem through /api/radio_frontend (default radio only),
// take effect immediately, and need no restart.
const PARAMS = {
  'agc.reset.interval': 'agc_reset_interval_seconds',
  'radio.fem.rxgain': 'fem_rx_gain',
  'radio.fem.txgain': 'fem_tx_gain',
  'radio.rxgain': 'rx_boosted_gain',
} as const satisfies Record<string, keyof RadioFrontendSettings>;

export type FrontendParam = keyof typeof PARAMS;

export const FRONTEND_PARAM_HELP: ReadonlyArray<[string, string, string]> = [
  ['agc.reset.interval', '<0-1020>', 'AGC reset interval, seconds (x4, 0 = off)'],
  ['radio.fem.rxgain', '<on|off>', 'External FEM RX gain (LNA)'],
  ['radio.fem.txgain', '<on|off>', 'External FEM TX gain (PA)'],
  ['radio.rxgain', '<on|off>', 'Radio chip boosted RX gain'],
];

export function isFrontendParam(param: string): param is FrontendParam {
  return param in PARAMS;
}

export interface FrontendResult {
  ok: boolean;
  text: string;
}

function errorText(error: unknown): string {
  const e = error as { response?: { data?: { error?: string } }; message?: string };
  return e.response?.data?.error || e.message || String(error);
}

export async function getFrontendParam(param: FrontendParam): Promise<FrontendResult> {
  const key = PARAMS[param];
  try {
    const result = await ApiService.getRadioFrontend();
    if (!result.success) return { ok: false, text: 'Radio front end not available' };
    const { available, supports, running } = result.data;
    if (!available || !supports[key]) return { ok: false, text: 'unsupported' };
    const value = running[key];
    if (value === undefined) return { ok: false, text: 'no response from radio' };
    if (typeof value === 'number') return { ok: true, text: value === 0 ? '0 (off)' : `${value}s` };
    return { ok: true, text: value ? 'on' : 'off' };
  } catch (error) {
    return { ok: false, text: errorText(error) };
  }
}

export async function setFrontendParam(
  param: FrontendParam,
  value: string,
): Promise<FrontendResult> {
  const key = PARAMS[param];
  const settings: RadioFrontendSettings = {};
  if (key === 'agc_reset_interval_seconds') {
    const seconds = Number(value);
    if (value === '' || !Number.isInteger(seconds) || seconds < 0 || seconds > 1020) {
      return { ok: false, text: 'AGC reset interval must be 0-1020 seconds' };
    }
    settings[key] = seconds;
  } else {
    const choice = value.toLowerCase();
    if (choice !== 'on' && choice !== 'off') return { ok: false, text: 'must be on or off' };
    settings[key] = choice === 'on';
  }
  try {
    const result = await ApiService.setRadioFrontend(settings);
    if (!result.success) {
      const reason = result.data?.errors?.[key] ?? result.error ?? 'failed to apply';
      return { ok: false, text: reason };
    }
    const applied = result.data?.applied[key];
    if (typeof applied === 'number') {
      return { ok: true, text: `OK - interval rounded to ${applied}` };
    }
    return { ok: true, text: 'OK' };
  } catch (error) {
    return { ok: false, text: errorText(error) };
  }
}
