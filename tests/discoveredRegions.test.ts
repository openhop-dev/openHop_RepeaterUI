import { beforeEach, describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

// Same localStorage stub the other scopes tests need: @vue/devtools-kit reads it
// when pinia is imported, and Node's experimental localStorage shadows jsdom's
// here, so the read throws at import time. Stub first, import dynamically after.
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

// saveChanges refreshes the system store afterwards, which reaches for the raw
// axios client; without a `get` that rejects as an unhandled error.
const apiClient = { get: vi.fn().mockResolvedValue({ data: { success: true, data: {} } }) };

vi.mock('@/utils/api', () => ({ default: api, apiClient }));

const { createPinia, setActivePinia } = await import('pinia');
const { useNeighborStore } = await import('@/stores/neighbors');

const NOW = 1785372000;

type ScopeRow = {
  scopes: string;
  status: 'responded' | 'timeout' | 'send_failed';
  queried_at: number;
  responded_at: number | null;
};

const scopeRow = (scopes: string): ScopeRow => ({
  scopes,
  status: 'responded',
  queried_at: NOW,
  responded_at: NOW,
});

describe('discoveredScopes aggregation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  const load = async (data: Record<string, ScopeRow>, served = '') => {
    api.getNeighborScopes.mockResolvedValue({ success: true, data, served: { scopes: served } });
    const store = useNeighborStore();
    await store.fetchScopes();
    return store;
  };

  it('unions every neighbour answer and counts who reported each region', async () => {
    const store = await load({
      ['aa'.repeat(32)]: scopeRow('DEN,BOU'),
      ['bb'.repeat(32)]: scopeRow('DEN'),
    });

    expect(store.discoveredScopes.map((r) => r.name)).toEqual(['BOU', 'DEN']);
    expect(store.discoveredScopes.find((r) => r.name === 'DEN')!.neighbors).toHaveLength(2);
    expect(store.discoveredScopes.find((r) => r.name === 'BOU')!.neighbors).toHaveLength(1);
  });

  it('deduplicates case variants rather than listing a region twice', async () => {
    const store = await load({
      ['aa'.repeat(32)]: scopeRow('den'),
      ['bb'.repeat(32)]: scopeRow('DEN'),
    });

    expect(store.discoveredScopes).toHaveLength(1);
    expect(store.discoveredScopes[0].neighbors).toHaveLength(2);
  });

  it('leaves out the wildcard, which is not a region and cannot be carried', async () => {
    const store = await load({ ['aa'.repeat(32)]: scopeRow('*,DEN') });

    expect(store.discoveredScopes.map((r) => r.name)).toEqual(['DEN']);
  });

  it('still lists regions from a neighbour whose latest query failed', async () => {
    // The stored row keeps the last good answer, so a rate-limited neighbour
    // should keep contributing what it told us before.
    const store = await load({
      ['aa'.repeat(32)]: { ...scopeRow('DEN'), status: 'timeout', queried_at: NOW + 60 },
    });

    expect(store.discoveredScopes.map((r) => r.name)).toEqual(['DEN']);
  });

  it('reports failure so the caller can offer a retry', async () => {
    api.getNeighborScopes.mockResolvedValue({ success: false, error: 'nope' });
    const store = useNeighborStore();

    expect(await store.fetchScopes()).toBe(false);

    api.getNeighborScopes.mockRejectedValue(new Error('offline'));
    expect(await store.fetchScopes()).toBe(false);
  });
});

describe('Region Configuration discovered column', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    api.getTransportKeys.mockResolvedValue({
      success: true,
      data: [{ id: 1, name: '#DEN', flood_policy: 'allow', parent_id: null }],
    });
    api.getDefaultRegion.mockResolvedValue({ success: true, data: { default_region: null } });
    api.getNeighborScopes.mockResolvedValue({
      success: true,
      data: {
        ['aa'.repeat(32)]: scopeRow('DEN,BOU'),
      },
      served: { scopes: '*,DEN' },
    });
    api.createTransportKey.mockResolvedValue({ success: true, data: { id: 2 } });
    api.updateDefaultRegion.mockResolvedValue({ success: true });
  });

  const mountTab = async () => {
    const { default: TransportKeys } = await import('@/components/configuration/TransportKeys.vue');
    const wrapper = mount(TransportKeys, { attachTo: document.body });
    await flushPromises();
    return wrapper;
  };

  // Discovered-region rows; the save bar's change list is made of <li> too.
  const rows = (wrapper: ReturnType<typeof mount>) =>
    wrapper.findAll('li').filter((li) => li.attributes('data-testid') !== 'save-bar-change');
  const saveBarChanges = (wrapper: ReturnType<typeof mount>) =>
    wrapper.findAll('[data-testid="save-bar-change"]').map((li) => li.text());

  it('marks a region already in the list as carried, with no add button', async () => {
    const wrapper = await mountTab();

    const den = rows(wrapper).find((li) => li.text().includes('DEN'))!;
    const bou = rows(wrapper).find((li) => li.text().includes('BOU'))!;

    expect(den.text()).toContain('Carried');
    expect(den.find('button').exists()).toBe(false);
    expect(bou.find('button').exists()).toBe(true);
    wrapper.unmount();
  });

  it('offers adding straight away, with no save bar until something is added', async () => {
    const wrapper = await mountTab();

    const bou = rows(wrapper).find((li) => li.text().includes('BOU'))!;
    expect((bou.find('button').element as HTMLButtonElement).disabled).toBe(false);
    expect(wrapper.find('[data-testid="save-bar"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('adds as a draft that flips to Carried and is created on save', async () => {
    const wrapper = await mountTab();

    await rows(wrapper)
      .find((li) => li.text().includes('BOU'))!
      .find('button')
      .trigger('click');

    // Immediately reflected against the working tree, not the saved one.
    const bou = rows(wrapper).find((li) => li.text().includes('BOU'))!;
    expect(bou.text()).toContain('Carried');
    expect(saveBarChanges(wrapper)).toEqual(['Add region #BOU flood allow']);
    expect(api.createTransportKey).not.toHaveBeenCalled();

    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('Save Changes'))!
      .trigger('click');
    await flushPromises();

    // '#'-prefixed like the region editor stores, allow-flood so it is advertised,
    // and no key material — the repeater derives it from the name.
    expect(api.createTransportKey).toHaveBeenCalledWith('#BOU', 'allow', undefined, undefined);
    wrapper.unmount();
  });

  it('drops a drafted region when the change is discarded', async () => {
    const wrapper = await mountTab();
    await rows(wrapper)
      .find((li) => li.text().includes('BOU'))!
      .find('button')
      .trigger('click');

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Discard')!
      .trigger('click');

    const bou = rows(wrapper).find((li) => li.text().includes('BOU'))!;
    expect(bou.text()).not.toContain('Carried');
    expect(api.createTransportKey).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
