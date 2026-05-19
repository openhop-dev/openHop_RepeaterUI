import axios from 'axios';
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import {
  getToken,
  isTokenExpired,
  shouldRefreshToken,
  setToken,
  getClientId,
} from './auth';
import { useAppRuntimeStore } from '@/stores/appRuntime';
import type { GPSDiagnostics } from '@/types/api';

// API Response interface for consistent response structure
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  count?: number;
  filters?: Record<string, unknown>;
}

// Configure the base API URL
// Use relative paths in both dev and production since Vite proxy handles dev forwarding
const API_BASE_URL = '/api';
const API_SERVER_URL: string = '';

export { API_BASE_URL, API_SERVER_URL };

// Token refresh state
let isRefreshing = false;
let refreshPromise: Promise<string> | null = null;

/**
 * Refresh the JWT token
 */
async function refreshToken(): Promise<string> {
  // If already refreshing, return existing promise
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const token = getToken();
      if (!token) {
        throw new Error('No token to refresh');
      }

      const clientId = getClientId();
      const response = await axios.post(
        `${API_SERVER_URL}/auth/refresh`,
        { client_id: clientId },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (response.data.success && response.data.token) {
        const newToken = response.data.token;
        setToken(newToken);
        return newToken;
      } else {
        throw new Error('Token refresh failed');
      }
    } catch (error) {
      console.error('Token refresh error:', error);
      const appRuntime = useAppRuntimeStore();
      await appRuntime.handleAuthFailure('expired');
      throw error;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// Create axios instance with default configuration
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Create separate axios instance for auth endpoints (not under /api)
const authClient: AxiosInstance = axios.create({
  baseURL: API_SERVER_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Export auth client for login page
export { authClient };

// Request interceptor for authentication (for authClient)
authClient.interceptors.request.use(
  async (config) => {
    // Skip auth for login and refresh endpoints
    if (config.url?.includes('/auth/login') || config.url?.includes('/auth/refresh')) {
      return config;
    }

    // Add JWT token to all requests if available
    const token = getToken();
    if (token) {
      // Check if token should be refreshed
      if (shouldRefreshToken()) {
        try {
          const newToken = await refreshToken();
          config.headers.Authorization = `Bearer ${newToken}`;
          return config;
        } catch (error) {
          // Refresh failed, will be handled by response interceptor
          return Promise.reject(error);
        }
      }

      // Check if token is expired
      if (isTokenExpired()) {
        const appRuntime = useAppRuntimeStore();
        void appRuntime.handleAuthFailure('expired');
        return Promise.reject(new Error('Token expired'));
      }

      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => {
    console.error('Auth API Request Error:', error);
    return Promise.reject(error);
  },
);

// Response interceptor for error handling (for authClient)
authClient.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  (error) => {
    // Handle 401 Unauthorized - redirect to login
    if (error.response?.status === 401 || error.response?.status === 403) {
      const appRuntime = useAppRuntimeStore();
      void appRuntime.handleAuthFailure(error.response?.status === 403 ? 'forbidden' : 'unauthorized');
    }

    console.error('Auth API Response Error:', error.response?.data || error.message);
    return Promise.reject(error);
  },
);

// Request interceptor for authentication
apiClient.interceptors.request.use(
  async (config) => {
    // Skip auth for login endpoint
    if (config.url?.includes('/auth/login')) {
      return config;
    }

    // Add JWT token to all requests if available
    const token = getToken();
    if (token) {
      // Check if token should be refreshed
      if (shouldRefreshToken()) {
        try {
          const newToken = await refreshToken();
          config.headers.Authorization = `Bearer ${newToken}`;
          return config;
        } catch (error) {
          // Refresh failed, will be handled by response interceptor
          return Promise.reject(error);
        }
      }

      // Check if token is expired
      if (isTokenExpired()) {
        const appRuntime = useAppRuntimeStore();
        void appRuntime.handleAuthFailure('expired');
        return Promise.reject(new Error('Token expired'));
      }

      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => {
    console.error('API Request Error:', error);
    return Promise.reject(error);
  },
);

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  (error) => {
    // Handle 401 Unauthorized - redirect to login
    if (error.response?.status === 401 || error.response?.status === 403) {
      const appRuntime = useAppRuntimeStore();
      void appRuntime.handleAuthFailure(error.response?.status === 403 ? 'forbidden' : 'unauthorized');
    }

    console.error('API Response Error:', error.response?.data || error.message);
    return Promise.reject(error);
  },
);

// Generic API utility class
export class ApiService {
  /**
   * Generic GET request
   */
  static async get<T>(
    endpoint: string,
    params?: Record<string, unknown>,
    config?: AxiosRequestConfig,
  ): Promise<ApiResponse<T>> {
    try {
      const response = await apiClient.get(endpoint, { params, ...config });
      return response.data;
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  /**
   * Generic POST request
   */
  static async post<T>(
    endpoint: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<ApiResponse<T>> {
    try {
      const response = await apiClient.post(endpoint, data, config);
      return response.data;
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  /**
   * Generic PUT request
   */
  static async put<T>(
    endpoint: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<ApiResponse<T>> {
    try {
      const response = await apiClient.put(endpoint, data, config);
      return response.data;
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  /**
   * Generic DELETE request
   */
  static async delete<T>(endpoint: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    try {
      const response = await apiClient.delete(endpoint, config);
      return response.data;
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  // Domain-specific methods for Transport Keys
  static async getTransportKeys(): Promise<ApiResponse<unknown[]>> {
    return this.get('transport_keys');
  }

  static async sendAdvert(): Promise<ApiResponse<unknown>> {
    // CherryPy requires proper Content-Type and body for POST requests
    return this.post(
      'send_advert',
      {},
      {
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );
  }

  static async getGpsDiagnostics(): Promise<ApiResponse<GPSDiagnostics>> {
    return this.get('gps');
  }

  static async createTransportKey(
    name: string,
    flood_policy: string,
    transport_key?: string,
    parent_id?: number,
    last_used?: string,
  ): Promise<ApiResponse<unknown>> {
    const payload: Record<string, unknown> = {
      name,
      flood_policy,
      parent_id,
      last_used,
    };

    // Only include transport_key if provided
    if (transport_key !== undefined) {
      payload.transport_key = transport_key;
    }

    return this.post('transport_keys', payload);
  }

  static async getTransportKey(id: number): Promise<ApiResponse<unknown>> {
    return this.get(`transport_key/${id}`);
  }

  static async updateTransportKey(
    id: number,
    name?: string,
    flood_policy?: string,
    transport_key?: string,
    parent_id?: number,
    last_used?: string,
  ): Promise<ApiResponse<unknown>> {
    return this.put(`transport_key/${id}`, {
      name,
      flood_policy,
      transport_key,
      parent_id,
      last_used,
    });
  }

  static async deleteTransportKey(id: number): Promise<ApiResponse<unknown>> {
    return this.delete(`transport_key/${id}`);
  }

  static async updateUnscopedFloodPolicy(allow: boolean): Promise<ApiResponse<unknown>> {
    return this.post('unscoped_flood_policy', {
      unscoped_flood_allow: allow,
    });
  }

  static async getLogs(): Promise<{
    logs: Array<{ message: string; timestamp: string; level: string }>;
  }> {
    try {
      const response = await apiClient.get('logs');
      return response.data;
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  // Domain-specific methods for Neighbor management
  static async deleteAdvert(id: number): Promise<ApiResponse<unknown>> {
    return this.delete(`advert/${id}`);
  }

  static async pingNeighbor(
    target_id: string,
    timeout: number = 10,
  ): Promise<
    ApiResponse<{
      target_id: string;
      rtt_ms: number;
      snr_db: number;
      rssi: number;
      path: string[];
      tag: number;
      /** Present on firmware with multi-byte path hash support (issue #133).
       *  0 = 1-byte (legacy), 1 = 2-byte, 2 = 3-byte. Absent on older firmware. */
      path_hash_mode?: number;
    }>
  > {
    return this.post('ping_neighbor', { target_id, timeout });
  }

  // Domain-specific methods for Identity management
  static async getIdentities(): Promise<ApiResponse<unknown>> {
    return this.get('identities');
  }

  static async getIdentity(name: string): Promise<ApiResponse<unknown>> {
    return this.get('identity', { name });
  }

  static async createIdentity(data: {
    name: string;
    identity_key: string;
    type: string;
    settings?: Record<string, unknown>;
  }): Promise<ApiResponse<unknown>> {
    return this.post('create_identity', data);
  }

  static async updateIdentity(data: {
    name: string;
    new_name?: string;
    identity_key?: string;
    type?: 'room_server' | 'companion';
    settings?: Record<string, unknown>;
  }): Promise<ApiResponse<unknown>> {
    return this.put('update_identity', data);
  }

  static async deleteIdentity(
    name: string,
    type: 'room_server' | 'companion' = 'room_server',
  ): Promise<ApiResponse<unknown>> {
    const params = new URLSearchParams({ name });
    if (type === 'companion') {
      params.set('type', 'companion');
    }
    return this.delete(`delete_identity?${params.toString()}`);
  }

  static async sendRoomServerAdvert(name: string): Promise<ApiResponse<unknown>> {
    return this.post('send_room_server_advert', { name });
  }

  static async importRepeaterContacts(data: {
    companion_name: string;
    contact_types?: string[];
    hours?: number;
    limit?: number;
  }): Promise<ApiResponse<{ imported: number }>> {
    return this.post('companion/import_repeater_contacts', data);
  }

  // Domain-specific methods for ACL management
  static async getACLInfo(): Promise<ApiResponse<unknown>> {
    return this.get('acl_info');
  }

  static async getACLClients(params?: {
    identity_hash?: string;
    identity_name?: string;
  }): Promise<ApiResponse<unknown>> {
    return this.get('acl_clients', params);
  }

  static async removeACLClient(data: {
    public_key: string;
    identity_hash?: string;
  }): Promise<ApiResponse<unknown>> {
    return this.post('acl_remove_client', data);
  }

  static async getACLStats(): Promise<ApiResponse<unknown>> {
    return this.get('acl_stats');
  }

  // Domain-specific methods for Room Messages
  static async getRoomMessages(params: {
    room_name?: string;
    room_hash?: string;
    limit?: number;
    offset?: number;
  }): Promise<ApiResponse<unknown>> {
    return this.get('room_messages', params);
  }

  static async postRoomMessage(data: {
    room_name: string;
    message: string;
    author_pubkey?: string;
  }): Promise<ApiResponse<unknown>> {
    return this.post('room_post_message', data);
  }

  static async deleteRoomMessage(params: {
    room_name: string;
    message_id: number;
  }): Promise<ApiResponse<unknown>> {
    return this.delete(
      `room_message?room_name=${encodeURIComponent(params.room_name)}&message_id=${params.message_id}`,
    );
  }

  static async clearRoomMessages(room_name: string): Promise<ApiResponse<unknown>> {
    return this.delete(`room_messages?room_name=${encodeURIComponent(room_name)}`);
  }

  static async getRoomStats(room_name?: string): Promise<ApiResponse<unknown>> {
    return this.get('room_stats', room_name ? { room_name } : undefined);
  }

  static async getRoomClients(room_name: string): Promise<ApiResponse<unknown>> {
    return this.get('room_clients', { room_name });
  }

  // ========================
  // Backup & Restore
  // ========================

  static async exportConfig(
    includeSecrets = false,
  ): Promise<ApiResponse<{ meta: Record<string, string>; config: Record<string, unknown> }>> {
    const endpoint = includeSecrets ? 'config_export?include_secrets=true' : 'config_export';
    return this.get(endpoint);
  }

  static async importConfig(config: Record<string, unknown>): Promise<ApiResponse<unknown>> {
    return this.post('config_import', { config });
  }

  static async exportIdentityKey(): Promise<
    ApiResponse<{
      identity_key_hex: string;
      key_length_bytes: number;
      public_key_hex?: string;
      node_address?: string;
    }>
  > {
    return this.get('identity_export');
  }

  static async generateVanityKey(
    prefix: string,
    apply: boolean = false,
  ): Promise<
    ApiResponse<{ public_hex: string; private_hex: string; attempts: number; applied?: boolean }>
  > {
    return this.post('generate_vanity_key', { prefix, apply });
  }

  // ========================
  // Database Management
  // ========================

  static async getDbStats(): Promise<
    ApiResponse<{
      database_size_bytes: number;
      rrd_size_bytes: number;
      tables: Array<{
        name: string;
        row_count: number;
        oldest_timestamp?: number;
        newest_timestamp?: number;
        has_timestamp: boolean;
      }>;
    }>
  > {
    return this.get('db_stats');
  }

  static async purgeTable(
    tables: string[] | 'all',
  ): Promise<ApiResponse<Record<string, { deleted?: number; error?: string }>>> {
    return this.post('db_purge', { tables });
  }

  static async vacuumDb(): Promise<
    ApiResponse<{ size_before: number; size_after: number; freed_bytes: number }>
  > {
    return this.post('db_vacuum', {});
  }

  /**
   * Handle API errors consistently
   */
  private static handleError(error: unknown): Error {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        // Server responded with error status
        const message =
          error.response.data?.error ||
          error.response.data?.message ||
          `HTTP ${error.response.status}`;
        return new Error(message);
      } else if (error.request) {
        // Request was made but no response received
        return new Error('Network error - no response received');
      }
    }
    // Something else happened
    return new Error(error instanceof Error ? error.message : 'Unknown error occurred');
  }
}

// Export the axios instance for direct use if needed
export { apiClient };
export default ApiService;
