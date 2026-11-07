import { afterEach, describe, expect, it, vi } from 'vitest';
import ApiService, { apiClient } from '@/utils/api';
import { usage } from './fixtures/networkUsage';

afterEach(() => vi.restoreAllMocks());
describe('usage HTTP contract', () => {
  it('uses the API base once and returns the direct JSON body', async () => {
    const body = usage(168);
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: body });
    expect(await ApiService.getNetworkUsage(168)).toEqual(body);
    expect(get).toHaveBeenCalledWith('/network_usage', { params: { hours: 168 } });
  });
  it.each([0, 169, 1.5, NaN])(
    'rejects an invalid days value %s without a request',
    async (days) => {
      const get = vi.spyOn(apiClient, 'get');
      await expect(ApiService.getNetworkUsage(days)).rejects.toThrow('integer from 1 to 168');
      expect(get).not.toHaveBeenCalled();
    },
  );
});
