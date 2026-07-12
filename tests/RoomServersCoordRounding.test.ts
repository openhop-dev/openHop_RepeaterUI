import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

// Regression: Add Room Server form was seeding latitude/longitude from the
// repeater's system stats without rounding, resulting in more than 6 decimal
// places being shown as the default value in the form inputs.

vi.mock('@/utils/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    createIdentity: vi.fn().mockResolvedValue({ success: true }),
    updateIdentity: vi.fn().mockResolvedValue({ success: true }),
    getIdentities: vi
      .fn()
      .mockResolvedValue({ success: true, data: { configured: [], total_configured: 0, total_registered: 0 } }),
  },
  API_SERVER_URL: '',
}));

vi.mock('@/utils/preferences', () => ({
  getPreference: vi.fn((_, def) => def),
  setPreference: vi.fn(),
}));

vi.mock('@/stores/system', () => ({
  useSystemStore: () => ({
    stats: {
      config: {
        repeater: {
          latitude: -27.123456789,
          longitude: 153.987654321,
        },
      },
    },
  }),
}));

vi.mock('@/utils/constants', () => ({
  RESTART_POLL_ENDPOINT: '/api/needs_setup',
  RESTART_INITIAL_DELAY_MS: 0,
  RESTART_POLL_INTERVAL_MS: 0,
  RESTART_MAX_ATTEMPTS: 3,
  RESTART_STABLE_REQUIRED: 2,
}));

import ApiService from '@/utils/api';
import RoomServers from '@/views/RoomServers.vue';

function mountView() {
  setActivePinia(createPinia());
  return mount(RoomServers, {
    global: {
      stubs: {
        Teleport: true,
        Transition: true,
        RestartModal: true,
        ConfirmDialog: true,
        MessageDialog: true,
        LocationPicker: true,
        Spinner: true,
      },
    },
  });
}

describe('RoomServers Add form coordinate rounding', () => {
  beforeEach(() => vi.clearAllMocks());

  it('seeds latitude and longitude rounded to 6 decimal places', async () => {
    const wrapper = mountView();
    await flushPromises();

    const vm = wrapper.vm as any;
    vm.openCreateModal();
    await flushPromises();

    expect(vm.newIdentity.settings.latitude).toBe(-27.123457);
    expect(vm.newIdentity.settings.longitude).toBe(153.987654);
    expect(vm.newIdentity.settings.allow_read_only).toBe(true);
  });

  it('defaults missing allow_read_only to true when editing and preserves explicit false', async () => {
    const wrapper = mountView();
    await flushPromises();

    const vm = wrapper.vm as any;
    vm.openEditModal({
      name: 'Room One',
      settings: {
        node_name: 'Room One',
        latitude: 1,
        longitude: 2,
        admin_password: 'admin',
        guest_password: '',
      },
    });

    expect(vm.editingIdentity.settings.allow_read_only).toBe(true);

    vm.openEditModal({
      name: 'Room Two',
      settings: {
        node_name: 'Room Two',
        latitude: 1,
        longitude: 2,
        admin_password: 'admin',
        guest_password: '',
        allow_read_only: false,
      },
    });

    expect(vm.editingIdentity.settings.allow_read_only).toBe(false);
  });

  it('sends allow_read_only in create payload', async () => {
    const wrapper = mountView();
    await flushPromises();

    const vm = wrapper.vm as any;
    vm.openCreateModal();
    vm.newIdentity.name = 'Room Payload Test';
    vm.newIdentity.settings.allow_read_only = false;
    await vm.createIdentity();

    expect(ApiService.createIdentity).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Room Payload Test',
        settings: expect.objectContaining({
          allow_read_only: false,
        }),
      }),
    );
  });
});
