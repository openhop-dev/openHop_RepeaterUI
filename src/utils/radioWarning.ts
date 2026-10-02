import type { SystemStats } from '@/types/api';

export function getRadioWarning(stats: SystemStats | null) {
  const disconnected = stats?.modem_disconnected;
  if (disconnected?.length) {
    const kinds = new Set(disconnected.map((label) => label.split(':').pop()?.trim()));
    const transport =
      kinds.has('modem_usb') && kinds.has('modem_tcp')
        ? 'USB and TCP'
        : kinds.has('modem_usb')
          ? 'USB'
          : kinds.has('modem_tcp')
            ? 'TCP'
            : 'modem';
    const multiple = disconnected.length > 1;
    const reason =
      stats?.radio_error?.trim().replace(/[.!?]+$/, '') ||
      `Cannot connect to the configured modem${multiple ? 's' : ''}`;
    return {
      title: `Modem disconnected (${disconnected.join(', ')})`,
      details: `${reason}. Check ${multiple ? 'their' : 'its'} ${transport} connection${multiple ? 's' : ''}.`,
    };
  }
  if (String(stats?.radio_status ?? '').toLowerCase() !== 'degraded') return null;
  return {
    title: `Radio degraded (${stats?.config?.radio_type ?? 'configured radio'})`,
    details: stats?.radio_error || 'Radio initialization failed',
  };
}
