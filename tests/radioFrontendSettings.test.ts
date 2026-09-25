/**
 * RF front end (KISS modem AGC reset interval / FEM gain / chip boosted RX gain).
 *
 * The rows live inside Radio Hardware and follow its Edit / Save. They apply to
 * the modem live, so Save must apply them first, skip the hardware resave and
 * restart prompt when only they changed, and stop on a failure rather than
 * reporting success.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import RadioFrontendSettings from '@/components/configuration/RadioFrontendSettings.vue';
import RadioHardwareSettings from '@/components/configuration/RadioHardwareSettings.vue';
import { useSetupStore } from '@/stores/setup';
import { useSystemStore } from '@/stores/system';
import ApiService from '@/utils/api';

const apiMock = vi.hoisted(() => ({
  get: vi.fn().mockResolvedValue({ success: true, data: [] }),
  getSerialPorts: vi.fn().mockResolvedValue({ success: true, data: [] }),
  importConfig: vi.fn().mockResolvedValue({ success: true, data: {} }),
  getRadioFrontend: vi.fn(),
  setRadioFrontend: vi.fn(),
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

function status(overrides: Record<string, unknown> = {}) {
  return {
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
  };
}

function applied(running: Record<string, unknown>, appliedKeys: Record<string, unknown>) {
  return {
    success: true,
    data: { ...status({ running, configured: appliedKeys }), applied: appliedKeys, errors: {} },
  };
}

type Card = InstanceType<typeof RadioFrontendSettings>;

function mountCard(editing = false) {
  return mount(RadioFrontendSettings, { props: { editing } });
}

describe('RadioFrontendSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when the default radio is not a KISS modem', async () => {
    apiMock.getRadioFrontend.mockResolvedValue({
      success: true,
      data: status({ available: false }),
    });
    const wrapper = mountCard();
    await flushPromises();
    expect(wrapper.find('[data-testid="radio-frontend"]').exists()).toBe(false);
    expect(await (wrapper.vm as unknown as Card).apply()).toBe(true);
  });

  it('explains an old firmware / board with no controls', async () => {
    apiMock.getRadioFrontend.mockResolvedValue({
      success: true,
      data: status({
        supports: {
          agc_reset_interval_seconds: false,
          fem_rx_gain: false,
          fem_tx_gain: false,
          rx_boosted_gain: false,
        },
        running: {},
      }),
    });
    const wrapper = mountCard();
    await flushPromises();
    expect(wrapper.find('[data-testid="frontend-none"]').text()).toContain('KISS firmware v2');
  });

  it('shows running values, board defaults, and unsupported controls', async () => {
    apiMock.getRadioFrontend.mockResolvedValue({
      success: true,
      data: status({ configured: { agc_reset_interval_seconds: 32 } }),
    });
    const wrapper = mountCard();
    await flushPromises();
    expect(wrapper.get('[data-testid="frontend-agc"]').text()).toBe('32 s');
    expect(wrapper.get('[data-testid="frontend-fem_rx_gain"]').text()).toBe('Off (board default)');
    expect(wrapper.get('[data-testid="frontend-fem_tx_gain"]').text()).toBe(
      'Not available on this board',
    );
    expect(wrapper.get('[data-testid="frontend-rx_boosted_gain"]').text()).toBe(
      'On (board default)',
    );
  });

  it('follows the parent edit mode and reloads inputs from the modem', async () => {
    apiMock.getRadioFrontend.mockResolvedValue({ success: true, data: status() });
    const wrapper = mountCard();
    await flushPromises();
    expect(wrapper.find('[data-testid="frontend-agc-input"]').exists()).toBe(false);

    await wrapper.setProps({ editing: true });
    const agc = wrapper.get('[data-testid="frontend-agc-input"]');
    expect((agc.element as HTMLInputElement).value).toBe('32');
    await agc.setValue(12);

    // Cancel, then edit again: the abandoned value is gone.
    await wrapper.setProps({ editing: false });
    await wrapper.setProps({ editing: true });
    expect(
      (wrapper.get('[data-testid="frontend-agc-input"]').element as HTMLInputElement).value,
    ).toBe('32');
  });

  it('applies only changed settings and reports rounding', async () => {
    apiMock.getRadioFrontend.mockResolvedValue({ success: true, data: status() });
    apiMock.setRadioFrontend.mockResolvedValue(
      applied(
        { agc_reset_interval_seconds: 8, fem_rx_gain: false, rx_boosted_gain: false },
        { agc_reset_interval_seconds: 8, rx_boosted_gain: false },
      ),
    );
    const wrapper = mountCard();
    await flushPromises();
    await wrapper.setProps({ editing: true });
    await wrapper.get('[data-testid="frontend-agc-input"]').setValue(10);
    await wrapper.get('[data-testid="frontend-rx_boosted_gain-input"]').setValue('off');

    const card = wrapper.vm as unknown as Card;
    expect(card.hasChanges()).toBe(true);
    expect(await card.apply()).toBe(true);
    expect(ApiService.setRadioFrontend).toHaveBeenCalledWith({
      agc_reset_interval_seconds: 10,
      rx_boosted_gain: false,
    });

    await wrapper.setProps({ editing: false });
    expect(wrapper.get('[data-testid="frontend-success"]').text()).toContain('rounded to 8 s');
    expect(wrapper.get('[data-testid="frontend-agc"]').text()).toBe('8 s');
    expect(wrapper.get('[data-testid="frontend-rx_boosted_gain"]').text()).toBe('Off');
  });

  it('does not call the API when nothing changed', async () => {
    apiMock.getRadioFrontend.mockResolvedValue({ success: true, data: status() });
    const wrapper = mountCard();
    await flushPromises();
    await wrapper.setProps({ editing: true });
    const card = wrapper.vm as unknown as Card;
    expect(card.hasChanges()).toBe(false);
    expect(await card.apply()).toBe(true);
    expect(ApiService.setRadioFrontend).not.toHaveBeenCalled();
  });

  it('rejects an out-of-range interval before sending', async () => {
    apiMock.getRadioFrontend.mockResolvedValue({ success: true, data: status() });
    const wrapper = mountCard();
    await flushPromises();
    await wrapper.setProps({ editing: true });
    await wrapper.get('[data-testid="frontend-agc-input"]').setValue(2000);
    expect((wrapper.vm as unknown as Card).validate()).toContain('0-1020');
    await flushPromises();
    expect(wrapper.get('[data-testid="frontend-error"]').text()).toContain('0-1020');
    expect(ApiService.setRadioFrontend).not.toHaveBeenCalled();
  });

  it('reports a partial failure', async () => {
    apiMock.getRadioFrontend.mockResolvedValue({ success: true, data: status() });
    apiMock.setRadioFrontend.mockResolvedValue({
      success: false,
      error: 'Some settings were not applied (fem_rx_gain: radio did not apply setting)',
      data: { ...status(), applied: {}, errors: { fem_rx_gain: 'radio did not apply setting' } },
    });
    const wrapper = mountCard();
    await flushPromises();
    await wrapper.setProps({ editing: true });
    await wrapper.get('[data-testid="frontend-fem_rx_gain-input"]').setValue('on');
    expect(await (wrapper.vm as unknown as Card).apply()).toBe(false);
    await flushPromises();
    expect(wrapper.get('[data-testid="frontend-error"]').text()).toContain('fem_rx_gain');
  });
});

// ─── Inside Radio Hardware ─────────────────────────────────────────────────

const AIR = {
  frequency: 869618000,
  bandwidth: 62500,
  spreading_factor: 8,
  coding_rate: 8,
  tx_power: 14,
  preamble_length: 32,
};

function kissConfig() {
  return {
    radio_type: 'kiss',
    radio: { ...AIR },
    kiss: { port: '/dev/ttyACM0', baud_rate: 115200 },
  };
}

function mountPage(config: Record<string, unknown>) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const systemStore = useSystemStore();
  systemStore.stats = { config } as never;
  vi.spyOn(systemStore, 'fetchStats').mockResolvedValue({ config } as never);
  vi.spyOn(useSetupStore(), 'fetchRadioPresets').mockResolvedValue(undefined);
  return mount(RadioHardwareSettings, {
    global: { plugins: [pinia], stubs: { RestartModal: true, UnsavedChangesModal: true } },
  });
}

function button(wrapper: ReturnType<typeof mount>, text: string) {
  return wrapper.findAll('button').find((b) => b.text().includes(text));
}

async function click(wrapper: ReturnType<typeof mount>, text: string) {
  await button(wrapper, text)!.trigger('click');
  await flushPromises();
}

function restartShown(wrapper: ReturnType<typeof mount>) {
  return wrapper.findComponent({ name: 'RestartModal' }).props('modelValue');
}

function baudInput(wrapper: ReturnType<typeof mount>) {
  return wrapper
    .findAll('input[type="number"]')
    .find((i) => (i.element as HTMLInputElement).value === '115200')!;
}

describe('RadioHardwareSettings with the RF front end', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    apiMock.getRadioFrontend.mockResolvedValue({ success: true, data: status() });
    apiMock.importConfig.mockResolvedValue({ success: true, data: {} });
  });

  it('keeps the front-end rows in the page edit flow instead of hiding them', async () => {
    const wrapper = mountPage(kissConfig());
    await flushPromises();
    expect(wrapper.find('[data-testid="frontend-agc"]').exists()).toBe(true);
    expect(wrapper.findAll('button').filter((b) => b.text() === 'Edit')).toHaveLength(0);

    await click(wrapper, 'Edit Settings');
    expect(wrapper.find('[data-testid="frontend-agc-input"]').exists()).toBe(true);
  });

  it('saves a front-end-only change live, without resaving hardware or a restart', async () => {
    apiMock.setRadioFrontend.mockResolvedValue(
      applied(
        { agc_reset_interval_seconds: 32, fem_rx_gain: true, rx_boosted_gain: true },
        { fem_rx_gain: true },
      ),
    );
    const wrapper = mountPage(kissConfig());
    await flushPromises();
    await click(wrapper, 'Edit Settings');
    await wrapper.get('[data-testid="frontend-fem_rx_gain-input"]').setValue('on');
    await click(wrapper, 'Save Changes');

    expect(ApiService.setRadioFrontend).toHaveBeenCalledWith({ fem_rx_gain: true });
    expect(ApiService.importConfig).not.toHaveBeenCalled();
    expect(restartShown(wrapper)).toBe(false);
    expect(button(wrapper, 'Edit Settings')).toBeTruthy();
    expect(wrapper.get('[data-testid="frontend-fem_rx_gain"]').text()).toBe('On');
  });

  it('applies the front end first, then saves hardware and offers a restart', async () => {
    const order: string[] = [];
    apiMock.setRadioFrontend.mockImplementation(async () => {
      order.push('frontend');
      return applied(
        { agc_reset_interval_seconds: 32, fem_rx_gain: true, rx_boosted_gain: true },
        { fem_rx_gain: true },
      );
    });
    apiMock.importConfig.mockImplementation(async () => {
      order.push('hardware');
      return { success: true, data: {} };
    });
    const wrapper = mountPage(kissConfig());
    await flushPromises();
    await click(wrapper, 'Edit Settings');
    await wrapper.get('[data-testid="frontend-fem_rx_gain-input"]').setValue('on');
    await baudInput(wrapper).setValue(9600);
    await click(wrapper, 'Save Changes');

    expect(order).toEqual(['frontend', 'hardware']);
    expect(restartShown(wrapper)).toBe(true);
  });

  it('stops on a front-end failure and keeps editing', async () => {
    apiMock.setRadioFrontend.mockResolvedValue({
      success: false,
      error: 'Some settings were not applied (fem_rx_gain: radio did not apply setting)',
      data: { ...status(), applied: {}, errors: { fem_rx_gain: 'radio did not apply setting' } },
    });
    const wrapper = mountPage(kissConfig());
    await flushPromises();
    await click(wrapper, 'Edit Settings');
    await wrapper.get('[data-testid="frontend-fem_rx_gain-input"]').setValue('on');
    await baudInput(wrapper).setValue(9600);
    await click(wrapper, 'Save Changes');

    expect(ApiService.importConfig).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid="frontend-error"]').text()).toContain('fem_rx_gain');
    expect(button(wrapper, 'Save Changes')).toBeTruthy();
  });

  it('saving with no changes behaves as before: resaves hardware, no front-end call', async () => {
    const wrapper = mountPage(kissConfig());
    await flushPromises();
    await click(wrapper, 'Edit Settings');
    await click(wrapper, 'Save Changes');
    expect(ApiService.setRadioFrontend).not.toHaveBeenCalled();
    expect(ApiService.importConfig).toHaveBeenCalledTimes(1);
  });

  it('shows the front end only under the default radio on a multi-radio node', async () => {
    const config = {
      ...kissConfig(),
      radios: [
        { id: 'local', radio_type: 'kiss', radio: { ...AIR }, kiss: { port: '/dev/ttyACM0' } },
        { id: 'link', radio_type: 'kiss', radio: { ...AIR }, kiss: { port: '/dev/ttyACM1' } },
      ],
      fabric: { default_radio: 'link', tx_mode: 'bridge' },
    };
    const wrapper = mountPage(config);
    await flushPromises();
    const shown = () => wrapper.find('[data-testid="radio-frontend"]').exists();
    const card = (id: string) =>
      wrapper.findAll('button').find((b) => b.text().trim().startsWith(id))!;

    await card('local').trigger('click');
    await flushPromises();
    expect(shown()).toBe(false);
    await card('link').trigger('click');
    await flushPromises();
    expect(shown()).toBe(true);
  });

  it('keeps a KISS radio’s tuning and front-end keys when its port is edited', async () => {
    apiMock.getRadioFrontend.mockResolvedValue({
      success: true,
      data: status({ available: false }),
    });
    const kiss = {
      port: '/dev/ttyACM0',
      baud_rate: 115200,
      kiss_persistence: 255,
      agc_reset_interval_seconds: 4,
      fem_rx_gain: true,
    };
    const config = {
      radio_type: 'kiss',
      radio: { ...AIR },
      kiss: { ...kiss },
      radios: [
        { id: 'local', radio_type: 'kiss', radio: { ...AIR }, kiss: { ...kiss } },
        {
          id: 'link',
          radio_type: 'kiss',
          radio: { ...AIR },
          kiss: { port: '/dev/ttyACM1', baud_rate: 115200 },
        },
      ],
      fabric: { default_radio: 'local', tx_mode: 'bridge' },
    };
    const wrapper = mountPage(config);
    await flushPromises();
    await click(wrapper, 'Edit Settings');
    await baudInput(wrapper).setValue(57600);
    await click(wrapper, 'Save Changes');

    const calls = (ApiService.importConfig as ReturnType<typeof vi.fn>).mock.calls;
    const body = calls[calls.length - 1][0];
    const local = body.radios.find((r: { id: string }) => r.id === 'local');
    expect(local.kiss).toMatchObject({
      baud_rate: 57600,
      kiss_persistence: 255,
      agc_reset_interval_seconds: 4,
      fem_rx_gain: true,
    });
  });
});
