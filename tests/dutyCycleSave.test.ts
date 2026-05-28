import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

// ── Scenario ──────────────────────────────────────────────────────────────────
//
// Bug: DutyCycle.vue always showed "Failed to save settings" even when the API
// call succeeded.
//
// Root cause: saveChanges() checked `data.message || data.persisted`, but the
// API wraps its payload in a `data` envelope:
//   { success: true, data: { persisted: true, message: "..." } }
// Both data.message and data.persisted were undefined at the top level, so the
// condition was always falsy → always fell through to the error branch.
//
// Fix: check data.success (top-level) and read data.data?.message for the
// confirmation text. This matches the pattern used in AdvertSettings.vue.

vi.mock('@/utils/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
  API_SERVER_URL: '',
}));

vi.mock('@/stores/system', () => ({
  useSystemStore: () => ({
    stats: {
      config: {
        duty_cycle: {
          max_airtime_percent: 6.0,
          enforcement_enabled: true,
        },
      },
    },
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
import DutyCycle from '@/components/configuration/DutyCycle.vue';

function mountDutyCycle() {
  return mount(DutyCycle, {
    global: {
      stubs: { UnsavedChangesModal: true },
      plugins: [createPinia()],
    },
  });
}

// ApiService.post() returns response.data (the JSON body) directly, not a
// full AxiosResponse. The component then accesses .data on that, landing on
// the inner payload — so data.message and data.persisted are correctly found.
function apiSuccess() {
  return Promise.resolve({
    success: true,
    data: {
      applied: ['max_airtime=6.0%', 'enforcement=enabled'],
      persisted: true,
      live_update: true,
      restart_required: false,
      message: 'Duty cycle settings applied immediately.',
    },
  });
}

function apiFailure() {
  return Promise.resolve({
    success: false,
    error: 'No valid settings provided',
  });
}

describe('DutyCycle save — response envelope parsing', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows success message when API returns { success: true, data: { persisted, message } }', async () => {
    vi.mocked(ApiService.post).mockImplementation(() => apiSuccess());

    const wrapper = mountDutyCycle();

    // Enter edit mode
    await wrapper.find('button').trigger('click');
    await flushPromises();

    // Trigger save
    const saveBtn = wrapper.findAll('button').find((b) => b.text().includes('Save'));
    await saveBtn!.trigger('click');
    await flushPromises();

    expect(wrapper.text()).not.toContain('Failed to save settings');
    expect(wrapper.text()).toContain('Duty cycle settings applied immediately.');
  });

  it('shows error message when API returns { success: false }', async () => {
    vi.mocked(ApiService.post).mockImplementation(() => apiFailure());

    const wrapper = mountDutyCycle();

    await wrapper.find('button').trigger('click');
    await flushPromises();

    const saveBtn = wrapper.findAll('button').find((b) => b.text().includes('Save'));
    await saveBtn!.trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Failed to save settings');
    expect(wrapper.text()).not.toContain('Duty cycle settings applied immediately.');
  });

  it('calls the correct endpoint with max_airtime_percent and enforcement_enabled', async () => {
    vi.mocked(ApiService.post).mockImplementation(() => apiSuccess());

    const wrapper = mountDutyCycle();
    await wrapper.find('button').trigger('click');
    await flushPromises();

    const saveBtn = wrapper.findAll('button').find((b) => b.text().includes('Save'));
    await saveBtn!.trigger('click');
    await flushPromises();

    expect(ApiService.post).toHaveBeenCalledWith(
      '/update_duty_cycle_config',
      expect.objectContaining({
        max_airtime_percent: expect.any(Number),
        enforcement_enabled: expect.any(Boolean),
      }),
    );
  });
});
