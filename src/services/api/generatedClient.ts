import { Api } from '@/generated/openapi';

// Shared generated API client instance. Keep this thin; auth headers are applied by caller.
export const generatedApiClient = new Api({
  baseUrl: '/api',
});
