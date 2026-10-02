/**
 * Web terminal get/set for the KISS RF front end (agc.reset.interval,
 * radio.fem.rxgain, radio.fem.txgain, radio.rxgain). These read and apply
 * through /api/radio_frontend, not the cached stats, and reply like the
 * MeshCore CLI.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Terminal } from '@xterm/xterm';
import { createPinia, setActivePinia } from 'pinia';

const apiMock = vi.hoisted(() => ({
  getRadioFrontend: vi.fn(),
  setRadioFrontend: vi.fn(),
  post: vi.fn(),
  get: vi.fn(),
}));

vi.mock('@/utils/api', () => ({ default: apiMock, ApiService: apiMock, API_SERVER_URL: '' }));

import { GetCommand } from '@/commands/GetCommand';
import { SetCommand } from '@/commands/SetCommand';
import { useSystemStore } from '@/stores/system';

function makeTerm() {
  const lines: string[] = [];
  const term = {
    lines,
    write: vi.fn((s: string) => lines.push(s)),
    writeln: vi.fn((s: string) => lines.push(s + '\n')),
  };
  return term as unknown as Terminal & { lines: string[] };
}

const plain = (term: Terminal & { lines: string[] }) =>
  term.lines.join('').replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');

function status(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    data: {
      available: true,
      supports: {
        agc_reset_interval_seconds: true,
        fem_rx_gain: true,
        fem_tx_gain: false,
        rx_boosted_gain: true,
      },
      running: { agc_reset_interval_seconds: 32, fem_rx_gain: false, rx_boosted_gain: true },
      configured: {},
      ...overrides,
    },
  };
}

async function run(cmd: GetCommand | SetCommand, ...args: string[]) {
  const term = makeTerm();
  const writePrompt = vi.fn();
  await cmd.execute({ term, args, writePrompt });
  expect(writePrompt).toHaveBeenCalledTimes(1);
  return plain(term);
}

describe('web terminal RF front end', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    const store = useSystemStore();
    store.stats = { config: {} } as never;
    vi.spyOn(store, 'fetchStats').mockResolvedValue({} as never);
    apiMock.getRadioFrontend.mockResolvedValue(status());
  });

  it('gets values from the modem', async () => {
    expect(await run(new GetCommand(), 'agc.reset.interval')).toContain('✓ 32s');
    expect(await run(new GetCommand(), 'radio.fem.rxgain')).toContain('✓ off');
    expect(await run(new GetCommand(), 'radio.rxgain')).toContain('✓ on');
  });

  it('reports unsupported controls and non-KISS radios', async () => {
    expect(await run(new GetCommand(), 'radio.fem.txgain')).toContain('Error: unsupported');
    apiMock.getRadioFrontend.mockResolvedValue(status({ available: false }));
    expect(await run(new GetCommand(), 'agc.reset.interval')).toContain('Error: unsupported');
  });

  it('shows 0 as off', async () => {
    apiMock.getRadioFrontend.mockResolvedValue(
      status({ running: { agc_reset_interval_seconds: 0 } }),
    );
    expect(await run(new GetCommand(), 'agc.reset.interval')).toContain('0 (off)');
  });

  it('sets AGC and reports the modem’s rounding', async () => {
    apiMock.setRadioFrontend.mockResolvedValue({
      success: true,
      data: { ...status().data, applied: { agc_reset_interval_seconds: 8 }, errors: {} },
    });
    const out = await run(new SetCommand(), 'agc.reset.interval', '10');
    expect(apiMock.setRadioFrontend).toHaveBeenCalledWith({ agc_reset_interval_seconds: 10 });
    expect(out).toContain('OK - interval rounded to 8');
    expect(out).not.toContain('restart');
  });

  it('sets gains on/off', async () => {
    apiMock.setRadioFrontend.mockResolvedValue({
      success: true,
      data: { ...status().data, applied: { rx_boosted_gain: false }, errors: {} },
    });
    expect(await run(new SetCommand(), 'radio.rxgain', 'off')).toContain('✓ OK');
    expect(apiMock.setRadioFrontend).toHaveBeenCalledWith({ rx_boosted_gain: false });
  });

  it('validates before sending', async () => {
    expect(await run(new SetCommand(), 'agc.reset.interval', '2000')).toContain('0-1020');
    expect(await run(new SetCommand(), 'agc.reset.interval')).toContain('0-1020');
    expect(await run(new SetCommand(), 'radio.fem.rxgain', 'maybe')).toContain('on or off');
    expect(apiMock.setRadioFrontend).not.toHaveBeenCalled();
  });

  it('shows the per-setting reason on failure', async () => {
    apiMock.setRadioFrontend.mockResolvedValue({
      success: false,
      error: 'Some settings were not applied (fem_tx_gain: unsupported)',
      data: { ...status().data, applied: {}, errors: { fem_tx_gain: 'unsupported' } },
    });
    expect(await run(new SetCommand(), 'radio.fem.txgain', 'on')).toContain('Error: unsupported');
  });

  it('lists the parameters in help', async () => {
    expect(await run(new GetCommand())).toContain('agc.reset.interval');
    expect(await run(new SetCommand())).toContain('radio.rxgain <on|off>');
    expect(await run(new GetCommand(), 'nope')).toContain('Front end: agc.reset.interval');
  });
});
