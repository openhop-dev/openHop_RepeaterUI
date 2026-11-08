import ApiService from '@/utils/api';
import type { RadioFrontendSettings } from '@/generated/openapi';

// RF front-end parameters of one radio (KISS or openHop modem), named as in the
// MeshCore CLI. They are read from and applied to the modem through
// /api/radio_frontend, take effect immediately, and need no restart. An optional
// trailing radio id picks a radios[] entry; without it, the default radio.
const PARAMS = {
  'agc.reset.interval': 'agc_reset_interval_seconds',
  'radio.fem.rxgain': 'fem_rx_gain',
  'radio.fem.txgain': 'fem_tx_gain',
  'radio.rxgain': 'rx_boosted_gain',
} as const satisfies Record<string, keyof RadioFrontendSettings>;

export type FrontendParam = keyof typeof PARAMS;

// Widest AGC interval the repeater accepts from any radio (openHop modems). A KISS
// modem's own ceiling is lower and comes back from the server as limits/errors.
export const AGC_HOST_MAX_SEC = 3600;

export const FRONTEND_PARAM_HELP: ReadonlyArray<[string, string, string]> = [
  ['agc.reset.interval', '<seconds>', 'AGC reset interval (0 = off; range set by the radio)'],
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

export async function getFrontendParam(
  param: FrontendParam,
  radioId?: string,
): Promise<FrontendResult> {
  const key = PARAMS[param];
  try {
    const result = await ApiService.getRadioFrontend(radioId);
    if (!result.success) return { ok: false, text: 'Radio front end not available' };
    const { available, supports, running, unavailable_reason } = result.data;
    if (!available) return { ok: false, text: unavailable_reason || 'unsupported' };
    if (!supports[key]) return { ok: false, text: 'unsupported' };
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
  radioId?: string,
): Promise<FrontendResult> {
  const key = PARAMS[param];
  const settings: RadioFrontendSettings = {};
  if (key === 'agc_reset_interval_seconds') {
    const seconds = Number(value);
    // Only the host bound here: the server rejects anything outside this radio's own
    // range with a message that names it.
    if (value === '' || !Number.isInteger(seconds) || seconds < 0 || seconds > AGC_HOST_MAX_SEC) {
      return { ok: false, text: `AGC reset interval must be 0-${AGC_HOST_MAX_SEC} seconds` };
    }
    settings[key] = seconds;
  } else {
    const choice = value.toLowerCase();
    if (choice !== 'on' && choice !== 'off') return { ok: false, text: 'must be on or off' };
    settings[key] = choice === 'on';
  }
  try {
    const result = await ApiService.setRadioFrontend(settings, radioId);
    if (!result.success) {
      const reason = result.data?.errors?.[key] ?? result.error ?? 'failed to apply';
      return { ok: false, text: reason };
    }
    const applied = result.data?.applied[key];
    if (typeof applied === 'number' && applied !== settings[key]) {
      return { ok: true, text: `OK - interval now ${applied}` };
    }
    return { ok: true, text: 'OK' };
  } catch (error) {
    return { ok: false, text: errorText(error) };
  }
}
