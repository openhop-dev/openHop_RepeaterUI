import { describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useSystemStore } from '@/stores/system';
import { getRadioWarning } from '@/utils/radioWarning';
import type { SystemStats } from '@/types/api';

function stats(fields: Partial<SystemStats>): SystemStats {
  return { version: 'test', core_version: 'test', ...fields };
}

describe('radio warning', () => {
  it('updates and clears from realtime modem vitals without losing config', () => {
    setActivePinia(createPinia());
    const system = useSystemStore();
    system.stats = stats({ config: { radio_type: 'modem_tcp' }, modem_disconnected: [] });
    system.updateRealtimeStats(stats({ modem_disconnected: ['modem_tcp'] }));
    expect(getRadioWarning(system.stats)?.title).toBe('Modem disconnected (modem_tcp)');
    system.updateRealtimeStats(stats({ modem_disconnected: [] }));
    expect(getRadioWarning(system.stats)).toBeNull();
    expect(system.stats?.config?.radio_type).toBe('modem_tcp');
    system.$dispose();
  });

  it('shows modem disconnection on either transport, including after a previously healthy state', () => {
    expect(getRadioWarning(stats({ radio_status: 'ok', modem_disconnected: [] }))).toBeNull();
    expect(
      getRadioWarning(stats({ radio_status: 'ok', modem_disconnected: ['modem_tcp'] }))?.title,
    ).toBe('Modem disconnected (modem_tcp)');
    expect(
      getRadioWarning(stats({ radio_status: 'ok', modem_disconnected: ['modem_tcp'] }))?.details,
    ).toBe('Cannot connect to the configured modem. Check its TCP connection.');
    expect(
      getRadioWarning(stats({ radio_status: 'ok', modem_disconnected: ['modem_usb'] }))?.title,
    ).toBe('Modem disconnected (modem_usb)');
    expect(
      getRadioWarning(stats({ radio_status: 'ok', modem_disconnected: ['modem_usb'] }))?.details,
    ).toBe('Cannot connect to the configured modem. Check its USB connection.');
    expect(getRadioWarning(stats({ radio_status: 'ok', modem_disconnected: [] }))).toBeNull();
  });

  it('keeps the existing CH341 warning and reports multiple down modems', () => {
    expect(
      getRadioWarning(stats({ radio_status: 'degraded', config: { radio_type: 'sx1262_ch341' } }))
        ?.title,
    ).toBe('Radio degraded (sx1262_ch341)');
    expect(
      getRadioWarning(stats({ modem_disconnected: ['usb: modem_usb', 'tcp: modem_tcp'] }))?.title,
    ).toBe('Modem disconnected (usb: modem_usb, tcp: modem_tcp)');
    expect(
      getRadioWarning(stats({ modem_disconnected: ['usb: modem_usb', 'tcp: modem_tcp'] }))?.details,
    ).toBe('Cannot connect to the configured modems. Check their USB and TCP connections.');
    expect(
      getRadioWarning(
        stats({ modem_disconnected: ['modem_tcp'], radio_error: 'Connection refused' }),
      )?.details,
    ).toBe('Connection refused. Check its TCP connection.');
  });
});
