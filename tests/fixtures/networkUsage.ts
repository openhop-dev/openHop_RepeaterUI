import type { NetworkUsage } from '@/utils/networkUsage';

export function usage(hours = 24): NetworkUsage {
  return {
    hours,
    days: hours / 24,
    start: 1700086440 - hours * 3600,
    end: 1700086440,
    bucket_seconds: 60,
    available_since: 1700000040,
    partial: false,
    scope: 'host',
    interfaces: [
      {
        source: 'net:eth0',
        name: 'eth0',
        upload_bytes: 1500,
        download_bytes: 2000000,
        messages: 0,
      },
    ],
    mqtt: {
      brokers: [
        { source: 'mqtt:a', name: 'Alpha', upload_bytes: 1000, messages: 2 },
        { source: 'mqtt:b', name: 'Beta', upload_bytes: 2000, messages: 3 },
      ],
      upload_bytes: 3000,
      messages: 5,
    },
    collection: { running: true, last_sample: 1700086440, error: null },
  };
}
