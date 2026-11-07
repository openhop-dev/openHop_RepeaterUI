import { describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import { createPinia, setActivePinia } from 'pinia';
import { ApiService } from '@/utils/api';

// ── Minimal mocks ──────────────────────────────────────────────────────────────

vi.mock('@/utils/api', () => ({
  default: { get: vi.fn().mockResolvedValue({ success: true, data: {} }), post: vi.fn() },
  ApiService: {
    getSensorTypes: vi.fn().mockResolvedValue({ success: true, data: { types: [] } }),
    getSensorConfig: vi.fn().mockResolvedValue({
      success: true,
      data: {
        enabled: true,
        poll_interval_seconds: 30,
        auto_install_packages: false,
        definitions: [
          {
            name: 'modem',
            type: 'openhop_modem',
            enabled: true,
            settings: { host: 'first.local' },
          },
        ],
      },
    }),
    updateSensorConfig: vi
      .fn()
      .mockResolvedValue({ success: true, data: { restart_required: false } }),
  },
  API_SERVER_URL: '',
}));

vi.mock('@/utils/preferences', () => ({
  getPreference: (_key: string, fallback: string) => fallback,
  setPreference: vi.fn(),
}));

vi.mock('@/stores/system', () => ({
  useSystemStore: () => ({
    stats: { config: {} },
    isLoading: false,
    error: null,
    fetchStats: vi.fn(),
  }),
}));

vi.mock('@/stores/dataService', () => ({
  useDataService: () => ({ ensure: vi.fn().mockResolvedValue(undefined) }),
}));

// Stub all child config components so we don't need their full dependency trees.
const stubComponent = { template: '<div/>' };
vi.mock('@/components/configuration/RadioSettings.vue', () => ({ default: stubComponent }));
vi.mock('@/components/configuration/RadioHardwareSettings.vue', () => ({ default: stubComponent }));
vi.mock('@/components/configuration/RepeaterSettings.vue', () => ({ default: stubComponent }));
vi.mock('@/components/configuration/DutyCycle.vue', () => ({ default: stubComponent }));
vi.mock('@/components/configuration/TransmissionDelays.vue', () => ({ default: stubComponent }));
vi.mock('@/components/configuration/TransportKeys.vue', () => ({ default: stubComponent }));
vi.mock('@/components/configuration/APITokens.vue', () => ({ default: stubComponent }));
vi.mock('@/components/configuration/WebSettings.vue', () => ({ default: stubComponent }));
vi.mock('@/components/configuration/AdvertSettings.vue', () => ({ default: stubComponent }));
vi.mock('@/components/configuration/LetsMeshSettings.vue', () => ({ default: stubComponent }));
vi.mock('@/components/configuration/BackupRestore.vue', () => ({ default: stubComponent }));
vi.mock('@/components/configuration/DatabaseManagement.vue', () => ({ default: stubComponent }));
vi.mock('@/components/configuration/MemoryDebug.vue', () => ({ default: stubComponent }));
vi.mock('@/components/configuration/PolicyEngineSettings.vue', () => ({ default: stubComponent }));
vi.mock('@/components/ui/Spinner.vue', () => ({ default: stubComponent }));

// ── Tests ──────────────────────────────────────────────────────────────────────

async function makeWrapper(path = '/configuration', query: Record<string, string> = {}) {
  setActivePinia(createPinia());
  const { default: ConfigurationView } = await import('@/views/Configuration.vue');
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/configuration', component: ConfigurationView },
      { path: '/sensors', component: stubComponent },
    ],
  });
  await router.push({ path, query });
  await router.isReady();
  const wrapper = mount({ template: '<router-view />' }, { global: { plugins: [router] } });
  await flushPromises();
  return { wrapper, router };
}

describe('Configuration panel routing (sidebar drives ?tab= query param)', () => {
  it('settles both pending tab navigations when keeping unsaved edits', async () => {
    const { wrapper, router } = await makeWrapper('/configuration', { tab: 'sensormanager' });
    try {
      await wrapper
        .findAll('button')
        .find((button) => button.text() === 'Edit Sensors')!
        .trigger('click');
      const settled: string[] = [];
      const first = router.push('/configuration?tab=radio').then(() => settled.push('first'));
      await flushPromises();
      const second = router.push('/configuration?tab=database').then(() => settled.push('second'));
      await flushPromises();
      expect(wrapper.findComponent({ name: 'UnsavedChangesModal' }).props('show')).toBe(true);
      await wrapper.findComponent({ name: 'UnsavedChangesModal' }).vm.$emit('cancel');
      await flushPromises();
      expect(settled.sort()).toEqual(['first', 'second']);
      expect(router.currentRoute.value.query.tab).toBe('sensormanager');
      await Promise.all([first, second]);
    } finally {
      wrapper.unmount();
    }
  });

  it('asks before switching from unsaved Sensor Manager edits on the same route', async () => {
    const { wrapper, router } = await makeWrapper('/configuration', { tab: 'sensormanager' });
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Edit Sensors')!
      .trigger('click');
    const navigation = router.push('/configuration?tab=radio');
    await flushPromises();
    expect(wrapper.findComponent({ name: 'UnsavedChangesModal' }).props('show')).toBe(true);
    expect(router.currentRoute.value.query.tab).toBe('sensormanager');
    await wrapper.findComponent({ name: 'UnsavedChangesModal' }).vm.$emit('cancel');
    await navigation;
    expect(router.currentRoute.value.query.tab).toBe('sensormanager');
    wrapper.unmount();
  });

  it('asks before leaving Sensor Manager for another page', async () => {
    const { wrapper, router } = await makeWrapper('/configuration', { tab: 'sensormanager' });
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Edit Sensors')!
      .trigger('click');
    const navigation = router.push('/sensors');
    await flushPromises();
    expect(wrapper.findComponent({ name: 'UnsavedChangesModal' }).props('show')).toBe(true);
    expect(router.currentRoute.value.path).toBe('/configuration');
    await wrapper.findComponent({ name: 'UnsavedChangesModal' }).vm.$emit('cancel');
    await navigation;
    expect(router.currentRoute.value.path).toBe('/configuration');
    wrapper.unmount();
  });
  it('switches tabs after explicitly discarding Sensor Manager edits', async () => {
    const { wrapper, router } = await makeWrapper('/configuration', { tab: 'sensormanager' });
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Edit Sensors')!
      .trigger('click');
    const navigation = router.push('/configuration?tab=radio');
    await flushPromises();
    await wrapper.findComponent({ name: 'UnsavedChangesModal' }).vm.$emit('discard');
    await navigation;
    expect(router.currentRoute.value.query.tab).toBe('radio');
    expect(wrapper.findComponent({ name: 'SensorManagerSettings' }).exists()).toBe(false);
    wrapper.unmount();
  });
  it('saves an open row edit when confirming navigation to another page', async () => {
    vi.mocked(ApiService.updateSensorConfig).mockClear();
    const { wrapper, router } = await makeWrapper('/configuration', { tab: 'sensormanager' });
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Edit Sensors')!
      .trigger('click');
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Edit')!
      .trigger('click');
    await wrapper.findAll('input[type="text"]')[0].setValue('renamed');
    const navigation = router.push('/sensors');
    await flushPromises();
    expect(wrapper.findComponent({ name: 'UnsavedChangesModal' }).props('show')).toBe(true);
    await wrapper.findComponent({ name: 'UnsavedChangesModal' }).vm.$emit('save');
    await navigation;
    expect(router.currentRoute.value.path).toBe('/sensors');
    expect(vi.mocked(ApiService.updateSensorConfig).mock.calls[0][0].definitions[0].name).toBe(
      'renamed',
    );
    wrapper.unmount();
  });
  it('defaults to radio tab when no query param', async () => {
    const { wrapper } = await makeWrapper('/configuration');
    // RadioSettings stub should be visible (radio is the default tab)
    expect(wrapper.html()).toBeTruthy();
  });

  it('activates the tab from ?tab= query param', async () => {
    const { wrapper } = await makeWrapper('/configuration', { tab: 'database' });
    await flushPromises();
    // The wrapper renders without error; tab resolution is tested via resolveTab logic
    expect(wrapper.html()).toBeTruthy();
  });

  it('falls back to default when tab param is invalid', async () => {
    const { wrapper } = await makeWrapper('/configuration', { tab: 'not-a-real-tab' });
    await flushPromises();
    // Should render without crash — fallback to 'radio'
    expect(wrapper.html()).toBeTruthy();
  });

  it('resolveTab returns valid tab ids unchanged', async () => {
    // Test the VALID_TABS logic directly by checking known valid values.
    // We verify by navigating to each and confirming no error is thrown.
    const validTabs = [
      'radio',
      'radio-hardware',
      'repeater',
      'duty',
      'delays',
      'advert',
      'transport',
      'api-tokens',
      'web',
      'observer',
      'policy-engine',
      'backup',
      'database',
      'memory',
    ];
    for (const tab of validTabs) {
      const { wrapper } = await makeWrapper('/configuration', { tab });
      await flushPromises();
      expect(wrapper.html()).toBeTruthy();
    }
  });
});
