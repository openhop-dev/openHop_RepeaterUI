/**
 * An add or edit left open in a Transport Keys KeyModal is unsaved work: the
 * page counts it, and Save on the way out applies it before saving.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

// @vue/devtools-kit reads localStorage when pinia is imported; see discoveredRegions.test.ts.
const storage = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => void storage.set(key, String(value)),
  removeItem: (key: string) => void storage.delete(key),
  clear: () => storage.clear(),
  key: (index: number) => [...storage.keys()][index] ?? null,
  get length() {
    return storage.size;
  },
});

const api = {
  getTransportKeys: vi.fn(),
  getDefaultRegion: vi.fn(),
  getNeighborScopes: vi.fn(),
  createTransportKey: vi.fn(),
  updateTransportKey: vi.fn(),
  deleteTransportKey: vi.fn(),
  updateUnscopedFloodPolicy: vi.fn(),
  updateDefaultRegion: vi.fn(),
};
const apiClient = { get: vi.fn().mockResolvedValue({ data: { success: true, data: {} } }) };
vi.mock('@/utils/api', () => ({ default: api, apiClient }));

// The arguments the page gave the leave guard: (isDirty, saving, discard, save).
const guard = vi.hoisted(() => ({ args: [] as unknown[] }));
vi.mock('@/composables/useUnsavedChanges', () => ({
  useUnsavedChanges: (...args: unknown[]) => {
    guard.args = args;
    return {
      showUnsavedModal: false,
      requestLeave: vi.fn(),
      handleDiscard: vi.fn(),
      handleSave: vi.fn(),
      handleCancel: vi.fn(),
    };
  },
}));

const { createPinia, setActivePinia } = await import('pinia');

describe('TransportKeys with a key modal open', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    api.getTransportKeys.mockResolvedValue({
      success: true,
      data: [{ id: 1, name: '#DEN', flood_policy: 'allow', parent_id: null }],
    });
    api.getDefaultRegion.mockResolvedValue({ success: true, data: { default_region: null } });
    api.getNeighborScopes.mockResolvedValue({ success: true, data: {}, served: { scopes: '' } });
    api.createTransportKey.mockResolvedValue({ success: true, data: { id: 2 } });
  });

  const mountTab = async () => {
    const { default: TransportKeys } = await import('@/components/configuration/TransportKeys.vue');
    const wrapper = mount(TransportKeys, { attachTo: document.body });
    await flushPromises();
    return wrapper;
  };
  const isEditing = (wrapper: Awaited<ReturnType<typeof mountTab>>) =>
    (wrapper.vm as unknown as { isEditing: boolean }).isEditing;
  const saveOnLeave = () => (guard.args[3] as () => Promise<boolean>)();

  async function typeNewRegion(wrapper: Awaited<ReturnType<typeof mountTab>>, name: string) {
    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('Add Region'))!
      .trigger('click');
    await flushPromises();
    const input = document.querySelector<HTMLInputElement>('.modal-card input[type="text"]')!;
    input.value = name;
    input.dispatchEvent(new Event('input'));
    await flushPromises();
  }

  it('counts a started add as unsaved', async () => {
    const wrapper = await mountTab();
    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('Add Region'))!
      .trigger('click');
    await flushPromises();
    expect(isEditing(wrapper)).toBe(false);

    await typeNewRegion(wrapper, 'BOU');
    expect(isEditing(wrapper)).toBe(true);
    wrapper.unmount();
  });

  it('adds the open entry and saves it when leaving with Save', async () => {
    const wrapper = await mountTab();
    await typeNewRegion(wrapper, 'BOU');

    expect(await saveOnLeave()).toBe(true);
    expect(api.createTransportKey).toHaveBeenCalledWith('#BOU', 'allow', undefined, undefined);
    wrapper.unmount();
  });
});
