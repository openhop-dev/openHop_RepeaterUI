import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import RestartModal from '@/components/modals/RestartModal.vue';

vi.mock('@/utils/api', () => ({
  default: {
    post: vi.fn(),
  },
}));

vi.mock('@/utils/constants', () => ({
  RESTART_POLL_ENDPOINT: '/api/needs_setup',
  RESTART_INITIAL_DELAY_MS: 0,
  RESTART_POLL_INTERVAL_MS: 0,
  RESTART_MAX_ATTEMPTS: 3,
  RESTART_STABLE_REQUIRED: 2,
}));

import apiClient from '@/utils/api';

function okFetch() {
  return Promise.resolve({ ok: true } as Response);
}

function failFetch() {
  return Promise.resolve({ ok: false } as Response);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn());
  vi.stubGlobal('location', { reload: vi.fn() });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mountModal(props = {}) {
  return mount(RestartModal, {
    props: {
      modelValue: true,
      message: 'Configuration changed. Restart required.',
      ...props,
    },
    global: {
      stubs: { Teleport: true },
    },
  });
}

describe('RestartModal', () => {
  describe('idle state', () => {
    it('renders title and message', () => {
      const wrapper = mountModal();
      expect(wrapper.text()).toContain('Service Restart Required');
      expect(wrapper.text()).toContain('Configuration changed. Restart required.');
    });

    it('shows custom title via prop', () => {
      const wrapper = mountModal({ title: 'Custom Title' });
      expect(wrapper.text()).toContain('Custom Title');
    });
  });

  describe('success response (HTTP 200, success: true)', () => {
    it('enters restarting state then reloads after stable polls', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({ success: true, message: 'ok' });
      vi.mocked(fetch).mockImplementation(okFetch);

      const wrapper = mountModal();
      await wrapper.find('button.modal-btn-primary').trigger('click');
      await flushPromises();

      expect(wrapper.text()).toContain('Restarting');

      await vi.runAllTimersAsync();
      await flushPromises();

      expect(window.location.reload).toHaveBeenCalled();
    });
  });

  describe('polkit / sudo failure (HTTP 200, success: false)', () => {
    it('shows failure message and does not poll', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({
        success: false,
        error: 'Permission denied: polkit refused the request',
      });

      const wrapper = mountModal();
      await wrapper.find('button.modal-btn-primary').trigger('click');
      await flushPromises();
      await vi.runAllTimersAsync();
      await flushPromises();

      expect(fetch).not.toHaveBeenCalled();
      expect(wrapper.text()).toContain('Restart failed: Permission denied');
      expect(wrapper.find('button.modal-btn-cancel').exists()).toBe(true);
    });

    it('shows generic failure when error field is absent', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({ success: false });

      const wrapper = mountModal();
      await wrapper.find('button.modal-btn-primary').trigger('click');
      await flushPromises();
      await vi.runAllTimersAsync();
      await flushPromises();

      expect(fetch).not.toHaveBeenCalled();
      expect(wrapper.text()).toContain('Restart failed.');
    });
  });

  describe('HTTP 403 (permission denied at HTTP level)', () => {
    it('shows polkit config message', async () => {
      vi.mocked(apiClient.post).mockRejectedValue(
        Object.assign(new Error('Forbidden'), {
          response: { status: 403, data: {} },
        }),
      );

      const wrapper = mountModal();
      await wrapper.find('button.modal-btn-primary').trigger('click');
      await flushPromises();
      await vi.runAllTimersAsync();
      await flushPromises();

      expect(fetch).not.toHaveBeenCalled();
      expect(wrapper.text()).toContain('polkit');
    });
  });

  describe('network drop (service restarted mid-request)', () => {
    it('enters restarting state and polls after network error', async () => {
      vi.mocked(apiClient.post).mockRejectedValue(
        Object.assign(new Error('Network error'), { code: 'ERR_NETWORK' }),
      );
      vi.mocked(fetch).mockImplementation(okFetch);

      const wrapper = mountModal();
      await wrapper.find('button.modal-btn-primary').trigger('click');
      await flushPromises();

      expect(wrapper.text()).toContain('Restarting');

      await vi.runAllTimersAsync();
      await flushPromises();

      expect(fetch).toHaveBeenCalled();
      expect(window.location.reload).toHaveBeenCalled();
    });
  });

  describe('startImmediately prop', () => {
    it('skips the POST and starts polling immediately when true', async () => {
      vi.mocked(fetch).mockImplementation(okFetch);

      // Mount closed, then open — the watcher fires on the false→true transition
      const wrapper = mountModal({ startImmediately: true, modelValue: false });
      await wrapper.setProps({ modelValue: true });
      await flushPromises();

      expect(apiClient.post).not.toHaveBeenCalled();
      expect(wrapper.text()).toContain('Restarting');

      await vi.runAllTimersAsync();
      await flushPromises();

      expect(fetch).toHaveBeenCalled();
      expect(window.location.reload).toHaveBeenCalled();
    });
  });

  describe('polling exhausted (service never comes back)', () => {
    it('shows timeout message after all attempts fail', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({ success: true, message: 'ok' });
      vi.mocked(fetch).mockImplementation(failFetch);

      const wrapper = mountModal();
      await wrapper.find('button.modal-btn-primary').trigger('click');
      await flushPromises();
      await vi.runAllTimersAsync();
      await flushPromises();

      expect(wrapper.text()).toContain('Service Did Not Restart');
      expect(wrapper.text()).toContain('did not respond after 60 seconds');
    });
  });

  describe('stable count resets on failure', () => {
    it('requires STABLE_REQUIRED consecutive 200s (not cumulative)', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({ success: true, message: 'ok' });

      let call = 0;
      vi.mocked(fetch).mockImplementation(() => {
        call++;
        // ok(1), fail(2), ok(3), ok(4)
        // With reset: stableCount goes 1→0→1→2 ✓ → reload on call 4 (4 total fetches)
        // Without reset: stableCount goes 1→1→2 ✓ → reload on call 3 (3 total fetches)
        // toHaveBeenCalledTimes(4) distinguishes these — test fails if reset is removed
        return call === 2 ? failFetch() : okFetch();
      });

      const wrapper = mountModal();
      await wrapper.find('button.modal-btn-primary').trigger('click');
      await flushPromises();
      await vi.runAllTimersAsync();
      await flushPromises();

      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(4);
      expect(window.location.reload).toHaveBeenCalled();
    });
  });

  describe('dismiss after failure', () => {
    it('closes the modal and resets state', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({ success: false, error: 'denied' });

      const wrapper = mountModal();
      await wrapper.find('button.modal-btn-primary').trigger('click');
      await flushPromises();
      await vi.runAllTimersAsync();
      await flushPromises();

      await wrapper.find('button.modal-btn-cancel').trigger('click');

      const emitted = wrapper.emitted('update:modelValue');
      expect(emitted).toBeTruthy();
      expect(emitted![emitted!.length - 1]).toEqual([false]);
    });
  });
});
