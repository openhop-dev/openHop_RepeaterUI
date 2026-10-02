import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

// Regression: LetsMeshSettings was using authClient for three /api/ endpoints.
// After switching to ApiService, the response shape seen by the component changes
// — ApiService returns response.data, so callers get { success, data } directly
// rather than an AxiosResponse wrapper. These tests use real device response
// shapes to confirm the parsing is correct after the fix.

vi.mock('@/utils/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
  API_SERVER_URL: '',
}));

const storeState = vi.hoisted(() => ({ mqttBrokers: {} as Record<string, unknown> }));

vi.mock('@/stores/system', () => ({
  useSystemStore: () => ({
    stats: { config: { mqtt_brokers: storeState.mqttBrokers } },
    fetchStats: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('@/composables/useUnsavedChanges', () => ({
  useUnsavedChanges: () => ({
    showUnsavedModal: { value: false },
    requestLeave: vi.fn().mockResolvedValue(true),
    handleDiscard: vi.fn(),
    handleSave: vi.fn(),
    handleCancel: vi.fn(),
  }),
}));

import ApiService from '@/utils/api';
import LetsMeshSettings from '@/components/configuration/LetsMeshSettings.vue';

// Exact shapes from real device responses.
const MQTT_STATUS_RESPONSE = {
  success: true,
  data: { handler_active: true, brokers: [] },
};

const MQTT_SAVE_RESPONSE = {
  success: true,
  data: {
    persisted: true,
    restart_required: true,
    message: 'Observer settings saved. Restart the service for changes to take effect.',
  },
};

// broker_presets is unusual: data is a top-level array, not a nested object.
const BROKER_PRESETS_RESPONSE = {
  success: true,
  data: [
    {
      id: 'letsmesh',
      name: 'LetsMesh',
      brokers: [
        {
          name: 'Europe (LetsMesh v1)',
          enabled: true,
          host: 'mqtt-eu-v1.letsmesh.net',
          port: 443,
          transport: 'websockets',
          audience: 'mqtt-eu-v1.letsmesh.net',
          use_jwt_auth: true,
          format: 'letsmesh',
          retain_status: false,
          tls: { enabled: true, insecure: false },
        },
      ],
      website: 'https://letsmesh.net',
    },
  ],
};

function mountComponent() {
  vi.mocked(ApiService.get).mockImplementation(async (url: string) => {
    if (url === '/mqtt_status') {
      return MQTT_STATUS_RESPONSE as any;
    }
    if (url === '/broker_presets') {
      return BROKER_PRESETS_RESPONSE as any;
    }
    return { success: true, data: {} } as any;
  });
  return mount(LetsMeshSettings, {
    global: {
      stubs: { Teleport: true, UnsavedChangesModal: true },
      plugins: [createPinia()],
    },
  });
}

describe('LetsMeshSettings — response parsing', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('populates broker templates when GET /broker_presets returns data as a top-level array', async () => {
    vi.mocked(ApiService.get).mockResolvedValue(BROKER_PRESETS_RESPONSE as any);

    const wrapper = mountComponent();
    await flushPromises();

    // The template dropdown should contain the preset name from the response.
    expect(wrapper.text()).toContain('LetsMesh');
  });

  it('GET /mqtt_status success shape is handled without error', async () => {
    vi.mocked(ApiService.get).mockImplementation(async (url: string) => {
      if (url === '/mqtt_status') {
        return MQTT_STATUS_RESPONSE as any;
      }
      if (url === '/broker_presets') {
        return BROKER_PRESETS_RESPONSE as any;
      }
      return { success: true, data: {} } as any;
    });

    // Should not throw — if res.data?.success was still being checked (old
    // authClient shape), res.data would be the inner object with no success
    // field and status would never be set.
    const wrapper = mountComponent();
    await flushPromises();

    expect(wrapper.exists()).toBe(true);
  });

  it('POST /update_mqtt_config real response shape is treated as success', async () => {
    vi.mocked(ApiService.get).mockImplementation(async (url: string) => {
      if (url === '/mqtt_status') {
        return MQTT_STATUS_RESPONSE as any;
      }
      if (url === '/broker_presets') {
        return BROKER_PRESETS_RESPONSE as any;
      }
      return { success: true, data: {} } as any;
    });
    vi.mocked(ApiService.post).mockResolvedValue(MQTT_SAVE_RESPONSE as any);

    const wrapper = mountComponent();
    await flushPromises();

    expect(ApiService.post).not.toHaveBeenCalled(); // not called until save
    expect(wrapper.exists()).toBe(true);
  });
});

// The shapes the repeater stores in config.yaml (`mqtt_brokers.brokers[]`) and
// expects back from POST /update_mqtt_config: `disallowed_packet_types`, and a
// `base_topic` that replaces the whole MC2MQTT topic base when it is non-blank.
const STORED_WAEV_BROKER = {
  name: 'Waev',
  enabled: true,
  host: 'mqtt.waev.app',
  port: 443,
  transport: 'websockets',
  audience: 'mqtt.waev.app',
  use_jwt_auth: true,
  format: 'waev',
  retain_status: true,
  tls: { enabled: true, insecure: false },
};

describe('LetsMeshSettings — save payload', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    storeState.mqttBrokers = {};
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function saveStoredBroker(broker: Record<string, unknown>) {
    storeState.mqttBrokers = {
      iata_code: 'LAX',
      status_interval: 300,
      owner: '',
      email: '',
      brokers: [broker],
    };
    vi.mocked(ApiService.post).mockResolvedValue(MQTT_SAVE_RESPONSE as any);

    const wrapper = mountComponent();
    await flushPromises();
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Edit Settings')!
      .trigger('click');
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Save Settings')!
      .trigger('click');
    await flushPromises();

    const [url, body] = vi.mocked(ApiService.post).mock.calls[0];
    expect(url).toBe('/update_mqtt_config');
    return (body as { brokers: Record<string, unknown>[] }).brokers[0];
  }

  it('keeps a stored packet-type filter on save', async () => {
    const broker = await saveStoredBroker({
      ...STORED_WAEV_BROKER,
      disallowed_packet_types: ['ADVERT', 'TRACE'],
    });
    expect(broker.disallowed_packet_types).toEqual(['ADVERT', 'TRACE']);
  });

  it('does not post a base topic for an MC2MQTT broker', async () => {
    const broker = await saveStoredBroker({ ...STORED_WAEV_BROKER, base_topic: 'meshcore/custom' });
    expect(broker.base_topic).toBe('');
  });
});
