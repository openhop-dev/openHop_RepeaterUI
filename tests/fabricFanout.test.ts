/**
 * Fabric fan-out controls: repeat_on_ingress and origin_tx.
 *
 * Both are only defined for an exactly-two-radio bridge, and the daemon refuses
 * to start on a combination it cannot honour — so what matters here is that the
 * form cannot produce one, not merely that it looks disabled.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import RadioHardwareSettings from '@/components/configuration/RadioHardwareSettings.vue';
import { useSetupStore } from '@/stores/setup';
import { useSystemStore } from '@/stores/system';
import ApiService from '@/utils/api';

const apiMock = vi.hoisted(() => ({
  get: vi.fn().mockResolvedValue({ success: true, data: [] }),
  getSerialPorts: vi.fn().mockResolvedValue({ success: true, data: [] }),
  importConfig: vi.fn().mockResolvedValue({ success: true, data: {} }),
}));

vi.mock('@/utils/api', () => ({
  default: apiMock,
  ApiService: apiMock,
  API_SERVER_URL: '',
  apiClient: {},
}));

vi.mock('@/composables/useUnsavedChanges', () => ({
  useUnsavedChanges: () => ({
    showUnsavedModal: false,
    requestLeave: vi.fn().mockResolvedValue(true),
    handleDiscard: vi.fn(),
    handleSave: vi.fn(),
    handleCancel: vi.fn(),
  }),
}));

const SX = {
  bus_id: 0,
  cs_id: 0,
  cs_pin: 21,
  reset_pin: 18,
  busy_pin: 20,
  irq_pin: 16,
  txen_pin: -1,
  rxen_pin: -1,
};

const SX_LINK = { ...SX, cs_id: 1, cs_pin: 7, reset_pin: 5, busy_pin: 6, irq_pin: 12 };

const AIR = {
  frequency: 869618000,
  bandwidth: 62500,
  spreading_factor: 8,
  coding_rate: 8,
  tx_power: 14,
  preamble_length: 32,
};

function radio(id: string, sx: Record<string, number>) {
  return { id, radio_type: 'sx1262', radio: { ...AIR }, sx1262: { ...sx } };
}

function mountComponent(config: Record<string, unknown>) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const systemStore = useSystemStore();
  systemStore.stats = { config } as never;
  vi.spyOn(systemStore, 'fetchStats').mockResolvedValue({ config } as never);
  const setupStore = useSetupStore();
  vi.spyOn(setupStore, 'fetchRadioPresets').mockResolvedValue(undefined);
  return mount(RadioHardwareSettings, {
    global: {
      plugins: [pinia],
      stubs: { RestartModal: true, UnsavedChangesModal: true },
    },
  });
}

function bridgeConfig(fabric: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
  return {
    radio_type: 'sx1262',
    radio: { ...AIR },
    sx1262: { ...SX },
    radios: [radio('local', SX), radio('link', SX_LINK)],
    fabric: { default_radio: 'local', tx_mode: 'bridge', ...fabric },
    ...extra,
  };
}

function buttonWithText(wrapper: ReturnType<typeof mount>, text: string) {
  return wrapper.findAll('button').find((button) => button.text().includes(text));
}

function repeatCheckbox(wrapper: ReturnType<typeof mount>) {
  return wrapper
    .findAll('label')
    .find((l) => l.text().includes('Repeat on ingress'))!
    .find('input[type="checkbox"]');
}

function originSelect(wrapper: ReturnType<typeof mount>) {
  return wrapper
    .findAll('label')
    .find((l) => l.text().includes('Originated traffic TX'))!
    .find('select');
}

function savedFabric() {
  const calls = (ApiService.importConfig as ReturnType<typeof vi.fn>).mock.calls;
  return calls[calls.length - 1][0].fabric as Record<string, unknown>;
}

async function edit(wrapper: ReturnType<typeof mount>) {
  await buttonWithText(wrapper, 'Edit Settings')!.trigger('click');
  await flushPromises();
}

async function save(wrapper: ReturnType<typeof mount>) {
  await buttonWithText(wrapper, 'Save Changes')!.trigger('click');
  await flushPromises();
}

describe('fabric fan-out controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('shows the saved fan-out state read-only', async () => {
    const wrapper = mountComponent(
      bridgeConfig({ repeat_on_ingress: true, origin_tx: 'all' }),
    );
    await flushPromises();

    const panel = wrapper.text();
    expect(panel).toContain('RF relay fan-out');
    expect(panel).toContain('Originated traffic TX');
    expect(panel).toContain('on');
    expect(panel).toContain('all');
  });

  it('reads origin_tx from local_tx_mode when that is the only spelling stored', async () => {
    const wrapper = mountComponent(bridgeConfig({ local_tx_mode: 'all' }));
    await flushPromises();
    await edit(wrapper);

    expect((originSelect(wrapper).element as HTMLSelectElement).value).toBe('all');
  });

  it('prefers origin_tx over local_tx_mode, matching the backend key order', async () => {
    const wrapper = mountComponent(
      bridgeConfig({ origin_tx: 'default', local_tx_mode: 'all' }),
    );
    await flushPromises();
    await edit(wrapper);

    expect((originSelect(wrapper).element as HTMLSelectElement).value).toBe('default');
  });

  it('never carries local_tx_mode into a save beside origin_tx', async () => {
    // The backend rejects a config that sets both names to different modes, so
    // a stale local_tx_mode spread from the stored section would fail the save.
    const wrapper = mountComponent(bridgeConfig({ local_tx_mode: 'all' }));
    await flushPromises();
    await edit(wrapper);
    await originSelect(wrapper).setValue('default');
    await save(wrapper);

    expect(savedFabric()).not.toHaveProperty('local_tx_mode');
    expect(savedFabric().origin_tx).toBe('default');
  });

  it('persists both fan-out options on a two-radio bridge', async () => {
    const wrapper = mountComponent(bridgeConfig());
    await flushPromises();
    await edit(wrapper);
    await repeatCheckbox(wrapper).setValue(true);
    await originSelect(wrapper).setValue('all');
    await save(wrapper);

    expect(savedFabric()).toMatchObject({
      tx_mode: 'bridge',
      repeat_on_ingress: true,
      origin_tx: 'all',
    });
  });

  it('disables repeat on ingress unless the TX mode is bridge', async () => {
    const wrapper = mountComponent(bridgeConfig({ tx_mode: 'sticky' }));
    await flushPromises();
    await edit(wrapper);

    expect(repeatCheckbox(wrapper).attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain('Requires fabric TX mode');
  });

  it('clears a checked repeat on ingress when the TX mode leaves bridge', async () => {
    const wrapper = mountComponent(bridgeConfig({ repeat_on_ingress: true }));
    await flushPromises();
    await edit(wrapper);
    expect((repeatCheckbox(wrapper).element as HTMLInputElement).checked).toBe(true);

    const txSelect = wrapper
      .findAll('label')
      .find((l) => l.text().includes('Fabric TX mode'))!
      .find('select');
    await txSelect.setValue('sticky');
    await flushPromises();

    expect((repeatCheckbox(wrapper).element as HTMLInputElement).checked).toBe(false);
    await save(wrapper);
    expect(savedFabric().repeat_on_ingress).toBe(false);
  });

  it('blocks both options on a three-radio fabric', async () => {
    const config = bridgeConfig();
    (config.radios as unknown[]).push(radio('link2', { ...SX_LINK, cs_id: 2, cs_pin: 8 }));
    const wrapper = mountComponent(config);
    await flushPromises();
    await edit(wrapper);

    expect(repeatCheckbox(wrapper).attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain('this node has 3');
    const allOption = originSelect(wrapper).findAll('option')[1];
    expect(allOption.attributes('disabled')).toBeDefined();
  });

  it('drops fan-out options when multi-radio is disabled', async () => {
    // radios: null leaves a one-radio node, which the backend refuses to start
    // while repeat_on_ingress is still set — so the disable has to clear it.
    const wrapper = mountComponent(
      bridgeConfig({ repeat_on_ingress: true, origin_tx: 'all' }),
    );
    await flushPromises();
    await buttonWithText(wrapper, 'Disable multi-radio')!.trigger('click');
    await flushPromises();
    await buttonWithText(wrapper, 'Save multi-radio config')!.trigger('click');
    await flushPromises();

    const calls = (ApiService.importConfig as ReturnType<typeof vi.fn>).mock.calls;
    const body = calls[calls.length - 1][0];
    expect(body.radios).toBeNull();
    expect(body.fabric).toMatchObject({ repeat_on_ingress: false, origin_tx: 'default' });
  });

  it('clamps an illegal stored combination at hydration, not just on change', async () => {
    // tx_mode 'default' equals the form ref's initial value, so neither
    // legality-watch source changes during hydration and the watcher never
    // fires. A config written before the rules were enforced would otherwise
    // render a checked *and* disabled box, then save it off without saying so.
    const wrapper = mountComponent(
      bridgeConfig({ tx_mode: 'default', repeat_on_ingress: true, origin_tx: 'all' }, {}),
    );
    await flushPromises();
    await edit(wrapper);

    const cb = repeatCheckbox(wrapper);
    expect((cb.element as HTMLInputElement).checked).toBe(false);
    expect(cb.attributes('disabled')).toBeDefined();
  });

  it('flags saved fan-out the running stack has not picked up', async () => {
    const wrapper = mountComponent(
      bridgeConfig(
        { repeat_on_ingress: true },
        { radio_stack: { repeat_on_ingress: false, origin_tx: 'default' } },
      ),
    );
    await flushPromises();

    expect(wrapper.text()).toContain('Saved fan-out settings are not live yet');
  });

  it('stays quiet when the running stack matches the saved config', async () => {
    const wrapper = mountComponent(
      bridgeConfig(
        { repeat_on_ingress: true },
        { radio_stack: { repeat_on_ingress: true, origin_tx: 'default' } },
      ),
    );
    await flushPromises();

    expect(wrapper.text()).not.toContain('Saved fan-out settings are not live yet');
  });

  it('stays quiet against a daemon that reports no fan-out state', async () => {
    const wrapper = mountComponent(
      bridgeConfig({ repeat_on_ingress: true }, { radio_stack: { mode: 'fabric' } }),
    );
    await flushPromises();

    expect(wrapper.text()).not.toContain('Saved fan-out settings are not live yet');
  });
});
