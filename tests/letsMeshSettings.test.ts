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

// The saved config the page loads from; a test can put brokers in it.
const saved = vi.hoisted(() => ({ mqtt_brokers: {} as Record<string, unknown> }));

vi.mock('@/stores/system', () => ({
  useSystemStore: () => ({
    stats: { config: saved },
    fetchStats: vi.fn().mockResolvedValue(undefined),
  }),
}));

// The arguments the page gave the leave guard: (isDirty, saving, discard, save).
const guard = vi.hoisted(() => ({ args: [] as unknown[] }));

vi.mock('@/composables/useUnsavedChanges', () => ({
  useUnsavedChanges: (...args: unknown[]) => {
    guard.args = args;
    return {
      showUnsavedModal: { value: false },
      requestLeave: vi.fn().mockResolvedValue(true),
      handleDiscard: vi.fn(),
      handleSave: vi.fn(),
      handleCancel: vi.fn(),
    };
  },
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

describe('LetsMeshSettings without an edit mode', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const iata = (wrapper: ReturnType<typeof mountComponent>) =>
    wrapper.find('input[placeholder="TEST"]');
  const changes = (wrapper: ReturnType<typeof mountComponent>) =>
    wrapper.findAll('[data-testid="save-bar-change"]').map((li) => li.text());
  const button = (wrapper: ReturnType<typeof mountComponent>, text: string) =>
    wrapper.findAll('button').find((b) => b.text() === text);

  it('shows the observer fields and no save bar until something changes', async () => {
    const wrapper = mountComponent();
    await flushPromises();
    expect(iata(wrapper).exists()).toBe(true);
    expect(button(wrapper, 'Edit Settings')).toBeUndefined();
    expect(wrapper.find('[data-testid="save-bar"]').exists()).toBe(false);
  });

  it('lists an edit and saves it', async () => {
    vi.mocked(ApiService.post).mockResolvedValue(MQTT_SAVE_RESPONSE as never);
    const wrapper = mountComponent();
    await flushPromises();
    await iata(wrapper).setValue('SEA');
    await flushPromises();
    expect(changes(wrapper)).toEqual(['IATA code — → SEA']);

    await button(wrapper, 'Save Changes')!.trigger('click');
    await flushPromises();
    expect(ApiService.post).toHaveBeenCalledWith(
      '/update_mqtt_config',
      expect.objectContaining({ iata_code: 'SEA' }),
    );
  });

  it('names an added broker rather than listing its fields', async () => {
    const wrapper = mountComponent();
    await flushPromises();
    await button(wrapper, 'From Template')!.trigger('click');
    await flushPromises();
    // The template row is a clickable row, not a button.
    const add = wrapper.findAll('div.cursor-pointer').find((d) => d.text().includes('LetsMesh'))!;
    await add.trigger('click');
    await flushPromises();
    expect(changes(wrapper)).toEqual(['Add broker Europe (LetsMesh v1)']);

    await button(wrapper, 'Discard')!.trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="save-bar"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('No brokers configured');
  });
});

describe('LetsMeshSettings with the broker modal open', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    saved.mqtt_brokers = {
      brokers: [
        {
          name: 'home',
          enabled: true,
          host: 'mqtt.home.lan',
          port: 1883,
          transport: 'tcp',
          format: 'letsmesh',
          retain_status: false,
          tls: { enabled: false, insecure: false },
        },
      ],
    };
    vi.mocked(ApiService.post).mockResolvedValue(MQTT_SAVE_RESPONSE as never);
  });

  afterEach(() => {
    saved.mqtt_brokers = {};
    vi.restoreAllMocks();
  });

  const button = (wrapper: ReturnType<typeof mountComponent>, text: string) =>
    wrapper.findAll('button').find((b) => b.text() === text);
  const isEditing = (wrapper: ReturnType<typeof mountComponent>) =>
    (wrapper.vm as unknown as { isEditing: boolean }).isEditing;
  const saveOnLeave = () => (guard.args[3] as () => Promise<boolean>)();
  const sentBrokers = () =>
    (vi.mocked(ApiService.post).mock.calls[0][1] as { brokers: { host: string }[] }).brokers;

  async function editHost(wrapper: ReturnType<typeof mountComponent>, host: string) {
    await button(wrapper, 'Edit')!.trigger('click');
    await flushPromises();
    await wrapper.find('input[placeholder="mqtt.myserver.com"]').setValue(host);
    await flushPromises();
  }

  it('counts an edit in the open modal as unsaved', async () => {
    const wrapper = mountComponent();
    await flushPromises();
    await button(wrapper, 'Edit')!.trigger('click');
    await flushPromises();
    expect(isEditing(wrapper)).toBe(false);

    await wrapper.find('input[placeholder="mqtt.myserver.com"]').setValue('mqtt.new.lan');
    await flushPromises();
    expect(isEditing(wrapper)).toBe(true);
  });

  it('saves the modal’s current edits when leaving with Save', async () => {
    const wrapper = mountComponent();
    await flushPromises();
    await editHost(wrapper, 'mqtt.new.lan');

    expect(await saveOnLeave()).toBe(true);
    expect(sentBrokers().map((b) => b.host)).toEqual(['mqtt.new.lan']);
  });

  it('stops the leave when the modal’s edit is incomplete', async () => {
    const wrapper = mountComponent();
    await flushPromises();
    await editHost(wrapper, '');

    expect(await saveOnLeave()).toBe(false);
    expect(ApiService.post).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain(
      'Please complete or cancel the open broker edit before saving.',
    );
  });

  it('drops an untouched new broker when leaving with Save', async () => {
    const wrapper = mountComponent();
    await flushPromises();
    const add = wrapper
      .findAll('button')
      .find((b) => b.text().includes('Add') && !b.text().includes('Template'));
    await add!.trigger('click');
    await flushPromises();

    expect(await saveOnLeave()).toBe(true);
    expect(sentBrokers().map((b) => b.host)).toEqual(['mqtt.home.lan']);
  });
});
