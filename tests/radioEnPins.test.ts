import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import RadioHardwareSettings from '@/components/configuration/RadioHardwareSettings.vue';
import { useSetupStore } from '@/stores/setup';
import { useSystemStore } from '@/stores/system';

const api = vi.hoisted(() => ({
  get: vi.fn(),
  getSerialPorts: vi.fn().mockResolvedValue({ success: true, data: [] }),
  importConfig: vi.fn().mockResolvedValue({ success: true, data: {} }),
}));
vi.mock('@/utils/api', () => ({
  default: api,
  ApiService: api,
  API_SERVER_URL: '',
  apiClient: {},
}));
vi.mock('@/composables/useUnsavedChanges', () => ({
  useUnsavedChanges: () => ({
    showUnsavedModal: false,
    requestLeave: vi.fn(),
    handleDiscard: vi.fn(),
    handleSave: vi.fn(),
    handleCancel: vi.fn(),
  }),
}));
enableAutoUnmount(afterEach);

const pins = { bus_id: 0, cs_id: 0, cs_pin: -1, reset_pin: 18, busy_pin: 5, irq_pin: 6 };
// Snapshot of all SX1262 boards in backend radio-settings.json; no sibling checkout
// or network dependency is required to run these component regressions.
import presets from './fixtures/stockRadioBoards.json';
type Wrapper = ReturnType<typeof mount>;

async function mountEditor(
  config: Record<string, unknown> = { radio_type: 'sx1262', sx1262: pins },
) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const system = useSystemStore();
  system.stats = { config } as never;
  vi.spyOn(system, 'fetchStats').mockResolvedValue({ config } as never);
  vi.spyOn(useSetupStore(), 'fetchRadioPresets').mockResolvedValue(undefined);
  const wrapper = mount(RadioHardwareSettings, {
    global: { plugins: [pinia], stubs: { RestartModal: true, UnsavedChangesModal: true } },
  });
  await flushPromises();
  return wrapper;
}

async function click(wrapper: Wrapper, text: string) {
  const button = wrapper.findAll('button').find((b) => b.text() === text);
  expect(button, wrapper.text()).toBeDefined();
  await button!.trigger('click');
  await flushPromises();
}

async function applyPreset(wrapper: Wrapper, key: string) {
  const name = presets.find((preset) => preset.key === key)?.name;
  const select = wrapper
    .findAll('select')
    .find((s) =>
      s
        .findAll('option')
        .some((option) => option.attributes('value') === key || option.text() === name),
    );
  expect(select).toBeDefined();
  const options = select!.findAll('option');
  const option =
    options.find((o) => o.attributes('value') === key) ?? options.find((o) => o.text() === name)!;
  await select!.setValue(option.attributes('value'));
}

function savedBody() {
  expect(api.importConfig).toHaveBeenCalledTimes(1);
  return api.importConfig.mock.calls[0][0];
}

function field(wrapper: Wrapper, text: string) {
  return wrapper
    .findAll('label')
    .find((label) => label.text() === text)!
    .find('input');
}

async function selectRadioType(wrapper: Wrapper, type: string) {
  await wrapper
    .findAll('select')
    .find((s) => s.find('option[value="sx1262"]').exists())!
    .setValue(type);
}

function expectEn(sx: Record<string, unknown>, expected: number | number[]) {
  if (Array.isArray(expected)) {
    expect(sx.en_pins).toEqual(expected);
    expect(sx).not.toHaveProperty('en_pin');
  } else {
    expect(sx.en_pin).toBe(expected);
    expect(sx).not.toHaveProperty('en_pins');
  }
}

const air = {
  frequency: 869618000,
  bandwidth: 62500,
  spreading_factor: 8,
  coding_rate: 8,
  tx_power: 14,
  preamble_length: 32,
};
const existingRadios = [
  { id: 'local', radio_type: 'kiss', kiss: { port: '/dev/ttyUSB0', baud_rate: 9600 }, radio: air },
  {
    id: 'network',
    radio_type: 'modem_tcp',
    modem_tcp: { host: 'modem.example', port: 5055 },
    radio: air,
  },
];

// Expected EN is taken directly from each stock board, independently of form parsing.
const boardCases = presets.map((preset) => ({
  key: preset.key,
  type: preset.config.radio_type ?? 'sx1262',
  expected: preset.config.en_pins ?? preset.config.en_pin ?? -1,
}));

describe('radio EN pin persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    api.get.mockResolvedValue({ success: true, data: presets });
  });

  it('saves the PiMesh scalar EN instead of manufacturing GPIO 0 from the empty list', async () => {
    const wrapper = await mountEditor();
    await click(wrapper, 'Edit Settings');
    await applyPreset(wrapper, 'pimesh-1w-v2');
    await click(wrapper, 'Save Changes');
    expect(savedBody().sx1262).toHaveProperty('en_pin', 26);
    expect(savedBody().sx1262).not.toHaveProperty('en_pins');
  });

  it.each(boardCases)(
    'preserves stock $key EN on single-radio save',
    async ({ key, type, expected }) => {
      const wrapper = await mountEditor();
      await click(wrapper, 'Edit Settings');
      await selectRadioType(wrapper, type);
      await applyPreset(wrapper, key);
      await click(wrapper, 'Save Changes');
      expectEn(savedBody().sx1262, expected);
    },
  );

  it.each(boardCases)(
    'preserves stock $key EN when adding to existing multi-radio',
    async ({ key, type, expected }) => {
      const wrapper = await mountEditor({
        radio_type: 'sx1262',
        radio: air,
        radios: existingRadios,
        fabric: { default_radio: 'local' },
      });
      await click(wrapper, 'Add radio');
      await selectRadioType(wrapper, type);
      await applyPreset(wrapper, key);
      await click(wrapper, 'Save multi-radio config');
      const body = savedBody();
      expect(body.radios).toHaveLength(3);
      expect(body.radios.slice(0, 2)).toEqual(existingRadios);
      expectEn(body.radios[2].sx1262, expected);
    },
  );

  it.each([
    { input: '   ', scalar: 26, expected: 26 },
    { input: ', ,', scalar: -1, expected: -1 },
    { input: '12, 13, ', scalar: -1, expected: [12, 13] },
    { input: ' , 0, , 26, ', scalar: -1, expected: [0, 26] },
    { input: '-1, invalid, Infinity, ', scalar: 21, expected: 21 },
    { input: '', scalar: 0, expected: 0 },
    { input: '0', scalar: -1, expected: [0] },
  ])(
    'saves explicit EN tokens without phantom zero: $input / scalar $scalar',
    async ({ input, scalar, expected }) => {
      const wrapper = await mountEditor();
      await click(wrapper, 'Edit Settings');
      await field(wrapper, 'Power Enable Pin').setValue(scalar);
      await field(wrapper, 'Power Enable Pins (array)').setValue(input);
      await click(wrapper, 'Save Changes');
      expectEn(savedBody().sx1262, expected);
    },
  );

  it.each([
    { sx: { ...pins, en_pin: 26 }, expected: 26 },
    { sx: { ...pins, en_pin: 0 }, expected: 0 },
    { sx: { ...pins, en_pin: -1 }, expected: -1 },
    { sx: { ...pins }, expected: -1 },
    { sx: { ...pins, en_pins: [0, 26] }, expected: [0, 26] },
  ])('round-trips loaded single-radio EN: $expected', async ({ sx, expected }) => {
    const wrapper = await mountEditor({ radio_type: 'sx1262', sx1262: sx });
    await click(wrapper, 'Edit Settings');
    await click(wrapper, 'Save Changes');
    expectEn(savedBody().sx1262, expected);
  });

  it.each([
    { sequence: ['rak6421-13300x-slot1', 'pimesh-1w-v2'], expected: 26 },
    { sequence: ['rak6421-13300x-slot2', 'ultrapeater-e22p'], expected: 21 },
    { sequence: ['rak6421-13300x-slot1', 'pimesh-1w-v2', 'waveshare'], expected: -1 },
    { sequence: ['ultrapeaterzero-e22p', 'ultrapeater-e22p', 'zebra-duo-hat-r0'], expected: -1 },
  ])(
    'replaces rather than carries EN across presets: $sequence',
    async ({ sequence, expected }) => {
      const wrapper = await mountEditor();
      await click(wrapper, 'Edit Settings');
      for (const key of sequence) await applyPreset(wrapper, key);
      await click(wrapper, 'Save Changes');
      expectEn(savedBody().sx1262, expected);
    },
  );

  it('preserves the local scalar EN while enabling multi-radio', async () => {
    const wrapper = await mountEditor({
      radio_type: 'sx1262',
      radio: air,
      sx1262: { ...pins, en_pin: 26 },
    });
    await click(wrapper, 'Enable multi-radio');
    // A non-GPIO secondary keeps this test about EN, not board pin collisions.
    await selectRadioType(wrapper, 'kiss');
    await click(wrapper, 'Save multi-radio config');
    expectEn(savedBody().radios[0].sx1262, 26);
  });

  it('replaces a saved list with a scalar when editing an existing multi-radio entry', async () => {
    const wrapper = await mountEditor({
      radio_type: 'sx1262',
      radio: air,
      radios: [
        { id: 'local', radio_type: 'sx1262', radio: air, sx1262: { ...pins, en_pins: [12, 13] } },
        existingRadios[1],
      ],
      fabric: { default_radio: 'local' },
    });
    await click(wrapper, 'Edit Settings');
    await applyPreset(wrapper, 'pimesh-1w-v2');
    await click(wrapper, 'Save Changes');
    const body = savedBody();
    expectEn(body.radios[0].sx1262, 26);
    expectEn(body.sx1262, 26);
    expect(body.radios[1]).toEqual(existingRadios[1]);
  });
});
