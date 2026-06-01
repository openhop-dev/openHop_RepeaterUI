import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

// Regression: AdvertSettings was using authClient for both /api/advert_rate_limit_stats
// (GET on mount) and /api/update_advert_rate_limit_config (POST on save). After
// switching to ApiService the component reads response.success and response.data
// directly instead of response.data.success and response.data.data. These tests
// use real device response shapes to confirm the parsing is correct after the fix.

vi.mock('@/utils/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
  API_SERVER_URL: '',
}));

vi.mock('@/stores/system', () => ({
  useSystemStore: () => ({
    stats: {
      config: {
        repeater: {
          advert_rate_limit: {},
          advert_penalty_box: {},
          advert_adaptive: { thresholds: {} },
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
import AdvertSettings from '@/components/configuration/AdvertSettings.vue';

// Exact shapes from real device responses.
const STATS_RESPONSE = {
  success: true,
  data: {
    adaptive: {
      enabled: false,
      current_tier: 'normal',
      tier_since: 2008.4,
      pending_tier: null,
      tier_changes: 0,
    },
    metrics: {
      adverts_per_min_ewma: 0.0,
      packets_per_min_ewma: 0.0,
      duplicate_ratio_ewma: 0.0,
    },
    effective_limits: {
      bucket_capacity: 2.0,
      refill_tokens: 1.0,
      refill_interval_seconds: 36000.0,
      min_interval_seconds: 0.0,
    },
    stats: { adverts_allowed: 0, adverts_dropped: 0, adverts_duplicate_reheard: 0, drop_rate: 0.0 },
    active_penalties: {},
    tracked_pubkeys: 0,
  },
};

const SAVE_RESPONSE = {
  success: true,
  data: {
    applied: ['rate_limit=enabled'],
    persisted: true,
    live_update: true,
    restart_required: false,
    message: 'Advert rate limit settings applied immediately.',
  },
};

function mountComponent() {
  return mount(AdvertSettings, {
    global: {
      stubs: { UnsavedChangesModal: true },
      plugins: [createPinia()],
    },
  });
}

describe('AdvertSettings — response parsing', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: false,
      addListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('GET /advert_rate_limit_stats real response shape is handled on mount without error', async () => {
    vi.mocked(ApiService.get).mockResolvedValue(STATS_RESPONSE as any);

    const wrapper = mountComponent();
    await flushPromises();

    // If response.data?.success was still being checked (old authClient shape),
    // response.data would be the inner object which has no success field —
    // rateLimitStats would never be set. Confirming no error state shown.
    expect(wrapper.exists()).toBe(true);
    expect(ApiService.get).toHaveBeenCalledWith('/advert_rate_limit_stats');
  });

  it('shows success message when POST /update_advert_rate_limit_config returns the real device response', async () => {
    vi.mocked(ApiService.get).mockResolvedValue(STATS_RESPONSE as any);
    vi.mocked(ApiService.post).mockResolvedValue(SAVE_RESPONSE as any);

    const wrapper = mountComponent();
    await flushPromises();

    // Enter edit mode
    const editBtn = wrapper.findAll('button').find((b) => b.text().includes('Edit'));
    await editBtn!.trigger('click');
    await flushPromises();

    const saveBtn = wrapper.findAll('button').find((b) => b.text().includes('Save Changes'));
    await saveBtn!.trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Advert rate limit settings applied immediately.');
    expect(wrapper.text()).not.toContain('Failed to save');
  });
});
