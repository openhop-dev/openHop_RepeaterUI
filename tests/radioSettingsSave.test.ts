/**
 * Radio Settings without an edit mode: the fields are always editable, a
 * change opens the save bar, and a TX power change still asks for the notice
 * before it is saved.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import RadioSettings from '@/components/configuration/RadioSettings.vue';
import { useSetupStore } from '@/stores/setup';
import { useSystemStore } from '@/stores/system';
import ApiService from '@/utils/api';

const apiMock = vi.hoisted(() => ({
  post: vi.fn().mockResolvedValue({ success: true, data: { message: 'saved', persisted: true } }),
  get: vi.fn().mockResolvedValue({ success: true, data: [] }),
}));

vi.mock('@/utils/api', () => ({ default: apiMock, ApiService: apiMock, apiClient: apiMock }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/composables/useUnsavedChanges', () => ({
  useUnsavedChanges: () => ({
    showUnsavedModal: false,
    requestLeave: vi.fn(),
    handleDiscard: vi.fn(),
    handleSave: vi.fn(),
    handleCancel: vi.fn(),
  }),
}));

const AIR = {
  frequency: 910525000,
  bandwidth: 62500,
  spreading_factor: 7,
  coding_rate: 5,
  tx_power: 14,
  preamble_length: 32,
};

function mountPage(config: Record<string, unknown>) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const system = useSystemStore();
  system.stats = { config } as never;
  vi.spyOn(system, 'fetchStats').mockResolvedValue({ config } as never);
  vi.spyOn(useSetupStore(), 'fetchRadioPresets').mockResolvedValue(undefined);
  return mount(RadioSettings, {
    global: {
      plugins: [pinia],
      stubs: { RestartModal: true, UnsavedChangesModal: true, TxPowerNoticeModal: true },
    },
  });
}

function input(wrapper: ReturnType<typeof mountPage>, value: string) {
  return wrapper
    .findAll('input[type="number"]')
    .find((i) => (i.element as HTMLInputElement).value === value)!;
}

function changes(wrapper: ReturnType<typeof mountPage>) {
  return wrapper.findAll('[data-testid="save-bar-change"]').map((li) => li.text());
}

async function save(wrapper: ReturnType<typeof mountPage>) {
  await wrapper
    .findAll('button')
    .find((b) => b.text() === 'Save Changes')!
    .trigger('click');
  await flushPromises();
}

describe('RadioSettings without an edit mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows editable fields and no save bar until something changes', async () => {
    const wrapper = mountPage({ radio: { ...AIR } });
    await flushPromises();
    expect(wrapper.findAll('button').some((b) => b.text() === 'Edit Settings')).toBe(false);
    expect(input(wrapper, '910.525').exists()).toBe(true);
    expect(wrapper.find('[data-testid="save-bar"]').exists()).toBe(false);
  });

  it('lists a frequency change and saves it', async () => {
    const wrapper = mountPage({ radio: { ...AIR } });
    await flushPromises();
    await input(wrapper, '910.525').setValue(907.875);
    await flushPromises();
    expect(changes(wrapper)).toEqual(['Frequency 910.525 MHz → 907.875 MHz']);

    await save(wrapper);
    expect(ApiService.post).toHaveBeenCalledWith(
      '/update_radio_config',
      expect.objectContaining({ frequency: 907875000, tx_power: 14 }),
    );
  });

  it('asks for the TX power notice before saving a power change', async () => {
    const wrapper = mountPage({ radio: { ...AIR } });
    await flushPromises();
    await input(wrapper, '14').setValue(20);
    await save(wrapper);

    expect(ApiService.post).not.toHaveBeenCalled();
    expect(wrapper.findComponent({ name: 'TxPowerNoticeModal' }).props('show')).toBe(true);
  });

  it('saves the selected radio’s settings by id, and locks the selector while unsaved', async () => {
    const wrapper = mountPage({
      radio: { ...AIR },
      radios: [
        { id: 'narrow', radio_type: 'kiss', radio: { ...AIR } },
        { id: 'g2', radio_type: 'modem_tcp', radio: { ...AIR } },
      ],
      fabric: { default_radio: 'narrow' },
    });
    await flushPromises();
    await input(wrapper, '910.525').setValue(907.875);
    await flushPromises();

    const selector = wrapper.findAll('select').find((s) => s.text().includes('g2'))!;
    expect(selector.attributes('disabled')).toBeDefined();

    await save(wrapper);
    expect(ApiService.post).toHaveBeenCalledWith(
      '/update_radio_config',
      expect.objectContaining({ radio_id: 'narrow', frequency: 907875000 }),
    );
  });
});
