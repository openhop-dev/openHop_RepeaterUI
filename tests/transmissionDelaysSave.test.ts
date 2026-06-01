import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

// Regression: TransmissionDelays was calling authClient (raw Axios) instead of
// ApiService. authClient.post returns an AxiosResponse so response.data was the
// full envelope { success, data: { ... } }. The component's defensive
// `const inner = data?.data ?? data` pattern was written to handle this, but
// switching to ApiService means response.data is the inner payload directly.
// These tests use the real response shape from POST /api/update_radio_config to
// confirm the component parses it correctly after the fix.

vi.mock('@/utils/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
  API_SERVER_URL: '',
}));

vi.mock('@/stores/system', () => ({
  useSystemStore: () => ({
    stats: { config: { delays: { tx_delay_factor: 1.0, direct_tx_delay_factor: 0.5 } } },
    fetchStats: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('@/composables/useUnsavedChanges', () => ({
  useUnsavedChanges: () => ({
    showUnsavedModal: { value: false },
    requestLeave: vi.fn().mockResolvedValue(true),
    handleDiscard: vi.fn(),
    handleSave: vi.fn(),
    handleCancel: vi.fn(),
  }),
}));

import ApiService from '@/utils/api';
import TransmissionDelays from '@/components/configuration/TransmissionDelays.vue';

// Exact shape from POST /api/update_radio_config on a real device.
const REAL_SUCCESS_RESPONSE = {
  success: true,
  data: {
    applied: ['txdelay=1.0', 'direct.txdelay=0.5'],
    persisted: true,
    live_update: true,
    restart_required: false,
    message: 'Settings applied immediately.',
  },
};

function mountComponent() {
  return mount(TransmissionDelays, {
    global: {
      stubs: { UnsavedChangesModal: true },
      plugins: [createPinia()],
    },
  });
}

describe('TransmissionDelays save — response parsing', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows success message when ApiService returns the real device response shape', async () => {
    vi.mocked(ApiService.post).mockResolvedValue(REAL_SUCCESS_RESPONSE as any);

    const wrapper = mountComponent();
    await wrapper.find('button').trigger('click'); // Enter edit mode
    await flushPromises();

    const saveBtn = wrapper.findAll('button').find((b) => b.text().includes('Save'));
    await saveBtn!.trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Settings applied immediately.');
    expect(wrapper.text()).not.toContain('Failed to save settings');
  });

  it('calls the correct endpoint path (no /api/ prefix — ApiService adds it)', async () => {
    vi.mocked(ApiService.post).mockResolvedValue(REAL_SUCCESS_RESPONSE as any);

    const wrapper = mountComponent();
    await wrapper.find('button').trigger('click');
    await flushPromises();

    const saveBtn = wrapper.findAll('button').find((b) => b.text().includes('Save'));
    await saveBtn!.trigger('click');
    await flushPromises();

    expect(ApiService.post).toHaveBeenCalledWith(
      '/update_radio_config',
      expect.objectContaining({
        tx_delay_factor: expect.any(Number),
        direct_tx_delay_factor: expect.any(Number),
      }),
    );
  });
});
