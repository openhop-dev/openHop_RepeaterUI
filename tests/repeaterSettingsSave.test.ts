/**
 * Repeater Settings without an edit mode: fields are always editable and the
 * save bar lists what changed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import RepeaterSettings from '@/components/configuration/RepeaterSettings.vue';
import { useSystemStore } from '@/stores/system';
import ApiService from '@/utils/api';

const apiMock = vi.hoisted(() => ({
  post: vi.fn().mockResolvedValue({ success: true, data: { message: 'saved', persisted: true } }),
  generateVanityKey: vi.fn(),
}));

vi.mock('@/utils/api', () => ({ default: apiMock, ApiService: apiMock, apiClient: apiMock }));
vi.mock('@/composables/useUnsavedChanges', () => ({
  useUnsavedChanges: () => ({
    showUnsavedModal: false,
    requestLeave: vi.fn(),
    handleDiscard: vi.fn(),
    handleSave: vi.fn(),
    handleCancel: vi.fn(),
  }),
}));

const CONFIG = {
  node_name: 'howl',
  repeater: {
    latitude: 47.6,
    longitude: -122.3,
    send_advert_interval_hours: 12,
    direct_advert_interval_hours: 0,
    mode: 'forward',
  },
  mesh: { path_hash_mode: 1 },
};

function mountPage() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const system = useSystemStore();
  system.stats = { config: CONFIG } as never;
  vi.spyOn(system, 'fetchStats').mockResolvedValue({ config: CONFIG } as never);
  return mount(RepeaterSettings, {
    global: {
      plugins: [pinia],
      stubs: { UnsavedChangesModal: true, LocationPicker: true },
    },
  });
}

function changes(wrapper: ReturnType<typeof mountPage>) {
  return wrapper.findAll('[data-testid="save-bar-change"]').map((li) => li.text());
}

describe('RepeaterSettings without an edit mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows editable fields and no save bar until something changes', async () => {
    const wrapper = mountPage();
    await flushPromises();
    const name = wrapper.find('input[type="text"]');
    expect((name.element as HTMLInputElement).value).toBe('howl');
    expect(wrapper.find('[data-testid="save-bar"]').exists()).toBe(false);
    expect(wrapper.findAll('button').some((b) => b.text() === 'Edit Settings')).toBe(false);
  });

  it('lists changes in the save bar and saves them', async () => {
    const wrapper = mountPage();
    await flushPromises();
    await wrapper.find('input[type="text"]').setValue('howl-2');
    await wrapper.find('select').setValue(3);
    await flushPromises();

    expect(changes(wrapper)).toEqual([
      'Node name howl → howl-2',
      'Path hash length 2 bytes → 3 bytes',
    ]);

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Save Changes')!
      .trigger('click');
    await flushPromises();
    expect(ApiService.post).toHaveBeenCalledWith('/update_radio_config', {
      node_name: 'howl-2',
      latitude: 47.6,
      longitude: -122.3,
      flood_advert_interval_hours: 12,
      direct_advert_interval_hours: 0,
      path_hash_mode: 2,
    });
  });

  it('discards a change', async () => {
    const wrapper = mountPage();
    await flushPromises();
    await wrapper.find('input[type="text"]').setValue('howl-2');
    await flushPromises();
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Discard')!
      .trigger('click');
    await flushPromises();
    expect((wrapper.find('input[type="text"]').element as HTMLInputElement).value).toBe('howl');
    expect(wrapper.find('[data-testid="save-bar"]').exists()).toBe(false);
  });
});
