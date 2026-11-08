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

  it('reports unsupported controls and radios without a front end', async () => {
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

  it('sets AGC and reports the value the radio settled on', async () => {
    apiMock.setRadioFrontend.mockResolvedValue({
      success: true,
      data: { ...status().data, applied: { agc_reset_interval_seconds: 8 }, errors: {} },
    });
    const out = await run(new SetCommand(), 'agc.reset.interval', '10');
    expect(apiMock.setRadioFrontend).toHaveBeenCalledWith(
      { agc_reset_interval_seconds: 10 },
      undefined,
    );
    expect(out).toContain('OK - interval now 8');
    expect(out).not.toContain('restart');
  });

  it('leaves the radio’s own range to the server and shows its reason', async () => {
    apiMock.setRadioFrontend.mockResolvedValue({
      success: false,
      error: 'Some settings were not applied',
      data: {
        ...status().data,
        applied: {},
        errors: {
          agc_reset_interval_seconds:
            "AGC reset interval 2000 is outside this radio's range (0-1020 seconds)",
        },
      },
    });
    const out = await run(new SetCommand(), 'agc.reset.interval', '2000');
    expect(apiMock.setRadioFrontend).toHaveBeenCalledWith(
      { agc_reset_interval_seconds: 2000 },
      undefined,
    );
    expect(out).toContain('(0-1020 seconds)');
  });

  it('says OK without a note when the radio kept the exact interval', async () => {
    apiMock.setRadioFrontend.mockResolvedValue({
      success: true,
      data: { ...status().data, applied: { agc_reset_interval_seconds: 2000 }, errors: {} },
    });
    const out = await run(new SetCommand(), 'agc.reset.interval', '2000');
    expect(out).toContain('OK');
    expect(out).not.toContain('interval now');
  });

  it('sets gains on/off', async () => {
    apiMock.setRadioFrontend.mockResolvedValue({
      success: true,
      data: { ...status().data, applied: { rx_boosted_gain: false }, errors: {} },
    });
    expect(await run(new SetCommand(), 'radio.rxgain', 'off')).toContain('✓ OK');
    expect(apiMock.setRadioFrontend).toHaveBeenCalledWith({ rx_boosted_gain: false }, undefined);
  });

  it('validates before sending', async () => {
    expect(await run(new SetCommand(), 'agc.reset.interval', '4000')).toContain('0-3600');
    expect(await run(new SetCommand(), 'agc.reset.interval', '-1')).toContain('0-3600');
    expect(await run(new SetCommand(), 'agc.reset.interval')).toContain('0-3600');
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

  it('reads and sets one radio when given its id', async () => {
    await run(new GetCommand(), 'radio.rxgain', 'g2');
    expect(apiMock.getRadioFrontend).toHaveBeenCalledWith('g2');

    apiMock.setRadioFrontend.mockResolvedValue({
      success: true,
      data: { ...status().data, applied: { fem_rx_gain: true }, errors: {} },
    });
    expect(await run(new SetCommand(), 'radio.fem.rxgain', 'on', 'g2')).toContain('✓ OK');
    expect(apiMock.setRadioFrontend).toHaveBeenCalledWith({ fem_rx_gain: true }, 'g2');
  });

  it('uses the default radio without an id', async () => {
    await run(new GetCommand(), 'radio.rxgain');
    expect(apiMock.getRadioFrontend).toHaveBeenCalledWith(undefined);
  });

  it('says why a configured radio has no controls', async () => {
    const reason = "radio 'g2' is configured but not running (restart to apply radios[] changes)";
    apiMock.getRadioFrontend.mockResolvedValue(
      status({ available: false, unavailable_reason: reason }),
    );
    expect(await run(new GetCommand(), 'radio.rxgain', 'g2')).toContain(`Error: ${reason}`);
  });

  it('shows the server’s reason when it refuses the radio id', async () => {
    apiMock.setRadioFrontend.mockRejectedValue(new Error("Unknown radio_id 'nope'"));
    expect(await run(new SetCommand(), 'radio.rxgain', 'on', 'nope')).toContain(
      "Error: Unknown radio_id 'nope'",
    );
  });

  it('rejects extra words after the radio id', async () => {
    expect(await run(new GetCommand(), 'radio.rxgain', 'g2', 'x')).toContain(
      'Usage: get radio.rxgain [radio_id]',
    );
    expect(await run(new SetCommand(), 'radio.rxgain', 'on', 'g2', 'x')).toContain(
      'Usage: set radio.rxgain <value> [radio_id]',
    );
    expect(apiMock.getRadioFrontend).not.toHaveBeenCalled();
    expect(apiMock.setRadioFrontend).not.toHaveBeenCalled();
  });

  it('lists the parameters in help', async () => {
    expect(await run(new GetCommand())).toContain('agc.reset.interval');
    expect(await run(new SetCommand())).toContain('radio.rxgain <on|off>');
    expect(await run(new GetCommand(), 'nope')).toContain('Front end: agc.reset.interval');
  });
});
