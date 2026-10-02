import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

const { apiGet, apiPost } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));

vi.mock('@/utils/api', () => ({
  default: {
    get: apiGet,
    post: apiPost,
  },
}));

import WebSettings from '@/components/configuration/WebSettings.vue';
import { useSystemStore } from '@/stores/system';

describe('Web settings CARTO API key', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    apiGet.mockReset().mockImplementation(async (url: string) => {
      if (url.includes('web_frontends')) {
        return {
          success: true,
          data: {
            selected_id: 'builtin',
            frontends: [
              {
                id: 'builtin',
                kind: 'builtin',
                name: 'Default Frontend',
                description: 'Built-in',
                path: null,
                version: '1.0.0',
                available: true,
                enabled: true,
                selected: true,
              },
              {
                id: 'console',
                kind: 'console',
                name: 'openHop Console',
                description: 'Console',
                path: '/opt/pymc_console/web/html',
                version: null,
                available: false,
                enabled: false,
                selected: false,
              },
            ],
          },
        };
      }
      return { success: true, data: { exists: false } };
    });
    apiPost.mockReset().mockResolvedValue({ success: true, data: {} });

    useSystemStore().stats = {
      version: 'test',
      core_version: 'test',
      config: {
        web: {
          cors_enabled: false,
          web_path: null,
          ...{ carto_api_key: 'configured-key' },
        },
      },
    };
  });

  it('omits the retired key control and leaves persisted configuration untouched on save', async () => {
    const wrapper = mount(WebSettings);
    await flushPromises();
    expect(wrapper.find('[data-testid="carto-api-key"]').exists()).toBe(false);
    await wrapper.get('#site-name').setValue('New site');
    await wrapper.get('#site-name').trigger('change');
    await flushPromises();
    expect(apiPost).toHaveBeenLastCalledWith('/update_web_config', {
      web: { cors_enabled: false, site_name: 'New site', web_path: null },
    });
    wrapper.unmount();
  });
});
