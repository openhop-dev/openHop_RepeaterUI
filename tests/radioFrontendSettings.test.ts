/**
 * Radio Hardware without an edit mode, and its live RF front end.
 *
 * Fields are always editable; differences from what the page loaded collect in
 * a save bar and are saved together, across radios. The RF front end (AGC reset
 * interval, FEM gain, chip boosted RX gain) is not part of that: each control is
 * sent to the modem as it changes, and a later hardware save carries the values
 * the modem confirmed so it cannot put the old ones back.
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
    radio_id: null,
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

const KISS_LIMITS = { agc_reset_interval_seconds: { min: 0, max: 1020, step: 4 } };
const OPENHOP_LIMITS = { agc_reset_interval_seconds: { min: 0, max: 3600, step: 1 } };

function mountCard(radioId?: string) {
  return mount(RadioFrontendSettings, { props: radioId ? { radioId } : {} });
}

async function commitAgc(wrapper: ReturnType<typeof mount>, value: number) {
  const input = wrapper.get('[data-testid="frontend-agc-input"]');
  await input.setValue(value);
  await input.trigger('change');
  await flushPromises();
}

describe('RadioFrontendSettings (live)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when the radio has no front end', async () => {
    apiMock.getRadioFrontend.mockResolvedValue({
      success: true,
      data: status({ available: false }),
    });
    const wrapper = mountCard();
    await flushPromises();
    expect(wrapper.find('[data-testid="radio-frontend"]').exists()).toBe(false);
  });

  it('says why a configured radio that is not running has no controls', async () => {
    const reason = "radio 'g2' is configured but not running (restart to apply radios[] changes)";
    apiMock.getRadioFrontend.mockResolvedValue({
      success: true,
      data: status({ available: false, unavailable_reason: reason }),
    });
    const wrapper = mountCard();
    await flushPromises();
    expect(wrapper.find('[data-testid="radio-frontend"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="radio-frontend-unavailable"]').text()).toBe(
      `Live tuning: ${reason}`,
    );
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
    const text = wrapper.get('[data-testid="frontend-none"]').text();
    expect(text).toContain('KISS firmware v2');
    expect(text).toContain('openHop modem firmware');
  });

  it('shows running values, board defaults, and unsupported controls', async () => {
    apiMock.getRadioFrontend.mockResolvedValue({
      success: true,
      data: status({ configured: { agc_reset_interval_seconds: 32 } }),
    });
    const wrapper = mountCard();
    await flushPromises();
    expect(wrapper.get('[data-testid="frontend-agc"]').text()).toBe('running: 32 s');
    expect(
      (wrapper.get('[data-testid="frontend-agc-input"]').element as HTMLInputElement).value,
    ).toBe('32');
    expect(wrapper.get('[data-testid="frontend-fem_rx_gain"]').text()).toBe('Off (board default)');
    expect(wrapper.get('[data-testid="frontend-fem_tx_gain"]').text()).toBe(
      'Not available on this board',
    );
    expect(wrapper.get('[data-testid="frontend-rx_boosted_gain"]').text()).toBe(
      'On (board default)',
    );
  });

  it('sends a switched gain at once, to its radio, and reports what the modem confirmed', async () => {
    apiMock.getRadioFrontend.mockResolvedValue({ success: true, data: status() });
    apiMock.setRadioFrontend.mockResolvedValue(
      applied(
        { agc_reset_interval_seconds: 32, fem_rx_gain: true, rx_boosted_gain: true },
        { fem_rx_gain: true },
      ),
    );
    const wrapper = mountCard('link');
    await flushPromises();
    const toggle = wrapper.get('[data-testid="frontend-fem_rx_gain-input"]');
    expect(toggle.attributes('aria-checked')).toBe('false');

    await toggle.trigger('click');
    await flushPromises();

    expect(ApiService.setRadioFrontend).toHaveBeenCalledWith({ fem_rx_gain: true }, 'link');
    expect(toggle.attributes('aria-checked')).toBe('true');
    expect(wrapper.get('[data-testid="frontend-fem_rx_gain"]').text()).toBe('On');
    expect(wrapper.emitted('applied')).toEqual([[{ fem_rx_gain: true }, 'link']]);
  });

  it('sends the AGC interval when the field is committed and shows where the radio settled', async () => {
    apiMock.getRadioFrontend.mockResolvedValue({ success: true, data: status() });
    apiMock.setRadioFrontend.mockResolvedValue(
      applied(
        { agc_reset_interval_seconds: 8, fem_rx_gain: false, rx_boosted_gain: true },
        { agc_reset_interval_seconds: 8 },
      ),
    );
    const wrapper = mountCard();
    await flushPromises();
    await commitAgc(wrapper, 10);

    expect(ApiService.setRadioFrontend).toHaveBeenCalledWith(
      { agc_reset_interval_seconds: 10 },
      undefined,
    );
    expect(wrapper.get('[data-testid="frontend-success"]').text()).toContain(
      'set the AGC reset interval to 8 s',
    );
    expect(
      (wrapper.get('[data-testid="frontend-agc-input"]').element as HTMLInputElement).value,
    ).toBe('8');
  });

  it('does not call the API when the interval did not change', async () => {
    apiMock.getRadioFrontend.mockResolvedValue({ success: true, data: status() });
    const wrapper = mountCard();
    await flushPromises();
    await commitAgc(wrapper, 32);
    expect(ApiService.setRadioFrontend).not.toHaveBeenCalled();
  });

  it('rejects an interval outside the radio’s own range before sending', async () => {
    apiMock.getRadioFrontend.mockResolvedValue({
      success: true,
      data: status({ limits: KISS_LIMITS }),
    });
    const wrapper = mountCard();
    await flushPromises();
    await commitAgc(wrapper, 2000);
    expect(wrapper.get('[data-testid="frontend-error"]').text()).toContain('0-1020');
    expect(ApiService.setRadioFrontend).not.toHaveBeenCalled();
  });

  it('uses the radio’s range and step for the input and hint', async () => {
    apiMock.getRadioFrontend.mockResolvedValue({
      success: true,
      data: status({ limits: KISS_LIMITS }),
    });
    const kissCard = mountCard();
    await flushPromises();
    const kissInput = kissCard.get('[data-testid="frontend-agc-input"]')
      .element as HTMLInputElement;
    expect([kissInput.max, kissInput.step]).toEqual(['1020', '4']);
    expect(kissCard.get('[data-testid="frontend-agc-hint"]').text()).toContain(
      'rounded down to a multiple of 4',
    );

    apiMock.getRadioFrontend.mockResolvedValue({
      success: true,
      data: status({ limits: OPENHOP_LIMITS }),
    });
    const modemCard = mountCard();
    await flushPromises();
    const modemInput = modemCard.get('[data-testid="frontend-agc-input"]')
      .element as HTMLInputElement;
    expect([modemInput.max, modemInput.step]).toEqual(['3600', '1']);
    const hint = modemCard.get('[data-testid="frontend-agc-hint"]').text();
    expect(hint).toContain('0-3600');
    expect(hint).not.toContain('rounded');
  });

  it('lets an openHop modem take intervals above a KISS modem’s ceiling', async () => {
    apiMock.getRadioFrontend.mockResolvedValue({
      success: true,
      data: status({ limits: OPENHOP_LIMITS }),
    });
    apiMock.setRadioFrontend.mockResolvedValue(
      applied({ agc_reset_interval_seconds: 2000 }, { agc_reset_interval_seconds: 2000 }),
    );
    const wrapper = mountCard();
    await flushPromises();
    await commitAgc(wrapper, 2000);
    expect(ApiService.setRadioFrontend).toHaveBeenCalledWith(
      { agc_reset_interval_seconds: 2000 },
      undefined,
    );
    expect(wrapper.get('[data-testid="frontend-success"]').text()).toBe('Applied to the radio.');
  });

  it('falls back to the host bound when the server sends no limits', async () => {
    apiMock.getRadioFrontend.mockResolvedValue({ success: true, data: status() });
    const wrapper = mountCard();
    await flushPromises();
    await commitAgc(wrapper, 4000);
    expect(wrapper.get('[data-testid="frontend-error"]').text()).toContain('0-3600');
  });

  it('reports a failure and leaves the control showing what the modem runs', async () => {
    apiMock.getRadioFrontend.mockResolvedValue({ success: true, data: status() });
    apiMock.setRadioFrontend.mockResolvedValue({
      success: false,
      error: 'Some settings were not applied (fem_rx_gain: radio did not apply setting)',
      data: { ...status(), applied: {}, errors: { fem_rx_gain: 'radio did not apply setting' } },
    });
    const wrapper = mountCard();
    await flushPromises();
    await wrapper.get('[data-testid="frontend-fem_rx_gain-input"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="frontend-error"]').text()).toContain('fem_rx_gain');
    expect(
      wrapper.get('[data-testid="frontend-fem_rx_gain-input"]').attributes('aria-checked'),
    ).toBe('false');
    expect(wrapper.emitted('applied')).toBeUndefined();
  });

  it('ignores a slow response for a radio that is no longer selected', async () => {
    let resolveSlow!: (value: unknown) => void;
    apiMock.getRadioFrontend.mockImplementation((radioId?: string) =>
      radioId === 'slow'
        ? new Promise((resolve) => (resolveSlow = resolve))
        : Promise.resolve({
            success: true,
            data: status({ running: { agc_reset_interval_seconds: 8 } }),
          }),
    );
    const wrapper = mountCard('slow');
    await wrapper.setProps({ radioId: 'fast' });
    await flushPromises();
    resolveSlow({ success: true, data: status({ running: { agc_reset_interval_seconds: 600 } }) });
    await flushPromises();
    expect(wrapper.get('[data-testid="frontend-agc"]').text()).toContain('8 s');
  });

  it('records a late apply for its own radio and leaves the newly shown one alone', async () => {
    apiMock.getRadioFrontend.mockImplementation((radioId?: string) =>
      Promise.resolve({
        success: true,
        data: status({
          running: {
            agc_reset_interval_seconds: radioId === 'link' ? 60 : 32,
            fem_rx_gain: false,
            rx_boosted_gain: true,
          },
        }),
      }),
    );
    let resolveApply!: (value: unknown) => void;
    apiMock.setRadioFrontend.mockImplementation(
      () => new Promise((resolve) => (resolveApply = resolve)),
    );
    const wrapper = mountCard('link');
    await flushPromises();
    await wrapper.get('[data-testid="frontend-fem_rx_gain-input"]').trigger('click');
    await wrapper.setProps({ radioId: 'local' });
    await flushPromises();
    resolveApply(
      applied(
        { agc_reset_interval_seconds: 60, fem_rx_gain: true, rx_boosted_gain: true },
        { fem_rx_gain: true },
      ),
    );
    await flushPromises();

    expect(wrapper.emitted('applied')).toEqual([[{ fem_rx_gain: true }, 'link']]);
    expect(wrapper.get('[data-testid="frontend-agc"]').text()).toContain('32 s');
    expect(
      wrapper.get('[data-testid="frontend-fem_rx_gain-input"]').attributes('aria-checked'),
    ).toBe('false');
  });

  it('takes no changes while locked', async () => {
    apiMock.getRadioFrontend.mockResolvedValue({ success: true, data: status() });
    const wrapper = mount(RadioFrontendSettings, { props: { locked: true } });
    await flushPromises();
    const toggle = wrapper.get('[data-testid="frontend-fem_rx_gain-input"]');
    expect(toggle.attributes('disabled')).toBeDefined();
    await toggle.trigger('click');
    expect(ApiService.setRadioFrontend).not.toHaveBeenCalled();
  });

  it('loads the newly selected radio’s values into its controls', async () => {
    apiMock.getRadioFrontend.mockImplementation((radioId?: string) =>
      Promise.resolve({
        success: true,
        data: status({ running: { agc_reset_interval_seconds: radioId === 'link' ? 60 : 32 } }),
      }),
    );
    const wrapper = mountCard('local');
    await flushPromises();
    await wrapper.setProps({ radioId: 'link' });
    await flushPromises();
    expect(
      (wrapper.get('[data-testid="frontend-agc-input"]').element as HTMLInputElement).value,
    ).toBe('60');
  });
});

// ─── Radio Hardware ────────────────────────────────────────────────────────

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

function twoRadioConfig(overrides: Record<string, unknown> = {}) {
  return {
    ...kissConfig(),
    modem_tcp: { host: 'shared', port: 5055 },
    radios: [
      {
        id: 'local',
        radio_type: 'kiss',
        radio: { ...AIR },
        kiss: { port: '/dev/ttyACM0', baud_rate: 115200 },
      },
      {
        id: 'link',
        radio_type: 'modem_tcp',
        radio: { ...AIR },
        modem_tcp: { host: '192.0.2.7', port: 5055 },
      },
    ],
    fabric: { default_radio: 'local', tx_mode: 'bridge' },
    ...overrides,
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

type Page = ReturnType<typeof mountPage>;

function button(wrapper: Page, text: string) {
  return wrapper.findAll('button').find((b) => b.text().includes(text));
}

async function click(wrapper: Page, text: string) {
  await button(wrapper, text)!.trigger('click');
  await flushPromises();
}

async function selectRadio(wrapper: Page, id: string) {
  await wrapper
    .findAll('nav button')
    .find((b) => b.text().trim().startsWith(id))!
    .trigger('click');
  await flushPromises();
}

function restartShown(wrapper: Page) {
  return wrapper.findComponent({ name: 'RestartModal' }).props('modelValue');
}

function numberInput(wrapper: Page, value: string) {
  return wrapper
    .findAll('input[type="number"]')
    .find((i) => (i.element as HTMLInputElement).value === value)!;
}

function saveBarChanges(wrapper: Page) {
  return wrapper.findAll('[data-testid="save-bar-change"]').map((li) => li.text());
}

function lastImport() {
  const calls = (ApiService.importConfig as ReturnType<typeof vi.fn>).mock.calls;
  return calls[calls.length - 1][0];
}

describe('RadioHardwareSettings without an edit mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    apiMock.getRadioFrontend.mockResolvedValue({ success: true, data: status() });
    apiMock.importConfig.mockResolvedValue({ success: true, data: {} });
  });

  it('shows editable fields with no Edit button and no save bar until something changes', async () => {
    const wrapper = mountPage(kissConfig());
    await flushPromises();
    expect(button(wrapper, 'Edit Settings')).toBeUndefined();
    expect(numberInput(wrapper, '115200').exists()).toBe(true);
    expect(wrapper.find('[data-testid="save-bar"]').exists()).toBe(false);
    expect((wrapper.vm as unknown as { isEditing: boolean }).isEditing).toBe(false);
  });

  it('lists a change in the save bar, and Discard puts the field back', async () => {
    const wrapper = mountPage(kissConfig());
    await flushPromises();
    await numberInput(wrapper, '115200').setValue(9600);
    await flushPromises();

    expect(saveBarChanges(wrapper)).toEqual(['Baud rate 115200 → 9600']);
    expect((wrapper.vm as unknown as { isEditing: boolean }).isEditing).toBe(true);

    await click(wrapper, 'Discard');
    expect(wrapper.find('[data-testid="save-bar"]').exists()).toBe(false);
    expect(numberInput(wrapper, '115200').exists()).toBe(true);
    expect(ApiService.importConfig).not.toHaveBeenCalled();
  });

  it('saves the change and offers a restart', async () => {
    const wrapper = mountPage(kissConfig());
    await flushPromises();
    await numberInput(wrapper, '115200').setValue(9600);
    await click(wrapper, 'Save Changes');

    expect(lastImport().kiss).toMatchObject({ baud_rate: 9600 });
    expect(restartShown(wrapper)).toBe(true);
  });

  it('keeps live tuning out of the save bar: no hardware save, no restart', async () => {
    apiMock.setRadioFrontend.mockResolvedValue(
      applied(
        { agc_reset_interval_seconds: 32, fem_rx_gain: true, rx_boosted_gain: true },
        { fem_rx_gain: true },
      ),
    );
    const wrapper = mountPage(kissConfig());
    await flushPromises();
    await wrapper.get('[data-testid="frontend-fem_rx_gain-input"]').trigger('click');
    await flushPromises();

    expect(ApiService.setRadioFrontend).toHaveBeenCalledWith({ fem_rx_gain: true }, undefined);
    expect(wrapper.find('[data-testid="save-bar"]').exists()).toBe(false);
    expect(ApiService.importConfig).not.toHaveBeenCalled();
    expect(restartShown(wrapper)).toBe(false);
  });

  it('shows the front end for an openHop USB or TCP modem', async () => {
    for (const config of [
      { radio_type: 'modem_usb', radio: { ...AIR }, modem_usb: { port: '/dev/ttyACM0' } },
      { radio_type: 'modem_tcp', radio: { ...AIR }, modem_tcp: { host: '10.0.0.5', port: 5055 } },
    ]) {
      const wrapper = mountPage(config);
      await flushPromises();
      expect(wrapper.find('[data-testid="radio-frontend"]').exists()).toBe(true);
      wrapper.unmount();
    }
  });

  it('hides the front end while the radio type is being changed', async () => {
    const wrapper = mountPage({
      radio_type: 'modem_usb',
      radio: { ...AIR },
      modem_usb: { port: '/dev/ttyACM0' },
    });
    await flushPromises();
    const typeSelect = wrapper
      .findAll('select')
      .find((s) => s.findAll('option').some((o) => o.attributes('value') === 'modem_tcp'))!;
    await typeSelect.setValue('modem_tcp');
    await flushPromises();
    expect(wrapper.find('[data-testid="radio-frontend"]').exists()).toBe(false);
    expect(saveBarChanges(wrapper)).toContain('Radio type modem_usb → modem_tcp');
  });
});

describe('RadioHardwareSettings with two radios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    apiMock.getRadioFrontend.mockResolvedValue({ success: true, data: status() });
    apiMock.importConfig.mockResolvedValue({ success: true, data: {} });
  });

  it('shows each radio’s own front end', async () => {
    const wrapper = mountPage(twoRadioConfig());
    await flushPromises();
    expect(wrapper.find('[data-testid="radio-frontend"]').exists()).toBe(true);
    expect(ApiService.getRadioFrontend).toHaveBeenLastCalledWith('local');
    await selectRadio(wrapper, 'link');
    expect(wrapper.find('[data-testid="radio-frontend"]').exists()).toBe(true);
    expect(ApiService.getRadioFrontend).toHaveBeenLastCalledWith('link');
  });

  it('keeps edits across radio switches and saves them together', async () => {
    const wrapper = mountPage(twoRadioConfig());
    await flushPromises();
    await numberInput(wrapper, '115200').setValue(57600);
    await selectRadio(wrapper, 'link');
    await numberInput(wrapper, '5055').setValue(5056);
    await flushPromises();

    expect(saveBarChanges(wrapper)).toEqual([
      'link › Port 5055 → 5056',
      'local › Baud rate 115200 → 57600',
    ]);
    expect(wrapper.find('[data-testid="radio-edited-local"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="radio-edited-link"]').exists()).toBe(true);

    // Back on local, its edit is still in the form.
    await selectRadio(wrapper, 'local');
    expect(numberInput(wrapper, '57600').exists()).toBe(true);

    await click(wrapper, 'Save Changes');
    const body = lastImport();
    const local = body.radios.find((r: { id: string }) => r.id === 'local');
    const link = body.radios.find((r: { id: string }) => r.id === 'link');
    expect(local.kiss).toMatchObject({ baud_rate: 57600 });
    expect(link.modem_tcp).toMatchObject({ host: '192.0.2.7', port: 5056 });
    expect(restartShown(wrapper)).toBe(true);
  });

  it('drops a radio from the list once its edit is undone', async () => {
    const wrapper = mountPage(twoRadioConfig());
    await flushPromises();
    await numberInput(wrapper, '115200').setValue(57600);
    await selectRadio(wrapper, 'link');
    await selectRadio(wrapper, 'local');
    await numberInput(wrapper, '57600').setValue(115200);
    await flushPromises();
    expect(wrapper.find('[data-testid="save-bar"]').exists()).toBe(false);
  });

  it('will not switch away from a radio whose edit is invalid', async () => {
    const wrapper = mountPage(twoRadioConfig());
    await flushPromises();
    await selectRadio(wrapper, 'link');
    const host = wrapper
      .findAll('input[type="text"]')
      .find((i) => (i.element as HTMLInputElement).value === '192.0.2.7')!;
    await host.setValue('');
    await selectRadio(wrapper, 'local');

    expect(wrapper.text()).toContain('TCP modem host is required');
    expect(wrapper.find('nav button[aria-current="true"]').text()).toContain('link');
  });

  it('lists and saves routing changes', async () => {
    const wrapper = mountPage(twoRadioConfig());
    await flushPromises();
    await click(wrapper, 'Routing');
    const mode = wrapper
      .findAll('select')
      .find((s) => s.findAll('option').some((o) => o.attributes('value') === 'sticky'))!;
    await mode.setValue('sticky');
    await flushPromises();

    expect(saveBarChanges(wrapper)).toEqual(['Routing › TX mode bridge → sticky']);
    await click(wrapper, 'Save Changes');
    expect(lastImport().fabric).toMatchObject({ tx_mode: 'sticky', default_radio: 'local' });
  });

  it('makes the selected radio the default TX radio from its own panel', async () => {
    const wrapper = mountPage(twoRadioConfig());
    await flushPromises();
    await selectRadio(wrapper, 'link');
    await click(wrapper, 'Make default TX');
    expect(saveBarChanges(wrapper)).toEqual(['Routing › Default TX radio local → link']);
  });

  it('shows inherited channel values on a radio card', async () => {
    const config = twoRadioConfig();
    (config.radios as Array<Record<string, unknown>>)[1] = {
      id: 'link',
      radio_type: 'modem_tcp',
    };
    const wrapper = mountPage(config);
    await flushPromises();
    const linkCard = wrapper.findAll('nav button').find((b) => b.text().startsWith('link'))!;
    expect(linkCard.text()).toContain('869.618 MHz · SF8 · 62.5 kHz');
    expect(linkCard.text()).not.toContain('Needs hardware');
  });

  it('loads and saves what a radio inherits, not form defaults', async () => {
    const config = twoRadioConfig({
      kiss: { port: '/dev/ttyACM1', baud_rate: 57600 },
      radio: { ...AIR, spreading_factor: 11, tx_power: 20 },
    });
    // link: a KISS radio with only a frequency of its own; port, baud and the
    // rest of its channel come from the top-level sections.
    (config.radios as Array<Record<string, unknown>>)[1] = {
      id: 'link',
      radio_type: 'kiss',
      radio: { frequency: 915000000 },
    };
    (config.radios as Array<Record<string, unknown>>)[0].kiss = {
      port: '/dev/ttyACM0',
      baud_rate: 115200,
    };
    const wrapper = mountPage(config);
    await flushPromises();
    await selectRadio(wrapper, 'link');

    expect(wrapper.find('[data-testid="save-bar"]').exists()).toBe(false);
    expect(numberInput(wrapper, '57600').exists()).toBe(true);
    expect(numberInput(wrapper, '20').exists()).toBe(true);

    await numberInput(wrapper, '57600').setValue(38400);
    await click(wrapper, 'Save Changes');
    const link = lastImport().radios.find((r: { id: string }) => r.id === 'link');
    expect(link.kiss).toMatchObject({ port: '/dev/ttyACM1', baud_rate: 38400 });
    expect(link.radio).toMatchObject({ frequency: 915000000, spreading_factor: 11, tx_power: 20 });
  });

  it('saves a hardware edit with the front-end values a modem confirmed live', async () => {
    apiMock.setRadioFrontend.mockResolvedValue(
      applied(
        { agc_reset_interval_seconds: 60, fem_rx_gain: false, rx_boosted_gain: true },
        { agc_reset_interval_seconds: 60 },
      ),
    );
    const wrapper = mountPage(twoRadioConfig());
    await flushPromises();
    await selectRadio(wrapper, 'link');
    const agc = wrapper.get('[data-testid="frontend-agc-input"]');
    await agc.setValue(60);
    await agc.trigger('change');
    await flushPromises();
    expect(ApiService.setRadioFrontend).toHaveBeenCalledWith(
      { agc_reset_interval_seconds: 60 },
      'link',
    );

    await numberInput(wrapper, '5055').setValue(5056);
    await click(wrapper, 'Save Changes');
    const body = lastImport();
    const link = body.radios.find((r: { id: string }) => r.id === 'link');
    expect(link.modem_tcp).toMatchObject({ port: 5056, agc_reset_interval_seconds: 60 });
    // The top-level sections mirror the default radio only.
    expect(body.modem_tcp?.agc_reset_interval_seconds).toBeUndefined();
  });

  it('keeps a KISS radio’s tuning and front-end keys when its baud rate is edited', async () => {
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
    const config = twoRadioConfig({ kiss: { ...kiss } });
    (config.radios as Array<Record<string, unknown>>)[0].kiss = { ...kiss };
    const wrapper = mountPage(config);
    await flushPromises();
    await numberInput(wrapper, '115200').setValue(57600);
    await click(wrapper, 'Save Changes');

    const local = lastImport().radios.find((r: { id: string }) => r.id === 'local');
    expect(local.kiss).toMatchObject({
      baud_rate: 57600,
      kiss_persistence: 255,
      agc_reset_interval_seconds: 4,
      fem_rx_gain: true,
    });
  });

  it('keeps a USB modem’s front-end keys when its baud rate is edited', async () => {
    apiMock.getRadioFrontend.mockResolvedValue({
      success: true,
      data: status({ available: false }),
    });
    const usb = {
      port: '/dev/ttyACM0',
      baudrate: 921600,
      agc_reset_interval_seconds: 120,
      rx_boosted_gain: true,
    };
    const config = {
      radio_type: 'modem_usb',
      radio: { ...AIR },
      modem_usb: { ...usb },
      radios: [
        { id: 'local', radio_type: 'modem_usb', radio: { ...AIR }, modem_usb: { ...usb } },
        {
          id: 'link',
          radio_type: 'modem_usb',
          radio: { ...AIR },
          modem_usb: { port: '/dev/ttyACM1', baudrate: 921600 },
        },
      ],
      fabric: { default_radio: 'local', tx_mode: 'bridge' },
    };
    const wrapper = mountPage(config);
    await flushPromises();
    await numberInput(wrapper, '921600').setValue(460800);
    await click(wrapper, 'Save Changes');

    const local = lastImport().radios.find((r: { id: string }) => r.id === 'local');
    expect(local.modem_usb).toMatchObject({
      baudrate: 460800,
      agc_reset_interval_seconds: 120,
      rx_boosted_gain: true,
    });
  });
});
