import axios from 'axios';
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import type { RequestParams } from '@/generated/openapi';
import {
  getToken,
  isTokenExpired,
  shouldRefreshToken,
  setToken,
  getClientId,
} from './auth';
import { useAppRuntimeStore } from '@/stores/appRuntime';
import type { GPSDiagnostics } from '@/types/api';
import { generatedApiClient } from '@/services/api/generatedClient';

type GeneratedEndpointData<T extends (...args: any[]) => Promise<{ data: any }>> =
  Awaited<ReturnType<T>>['data'];

type EndpointDataPayload<T extends (...args: any[]) => Promise<{ data: any }>> =
  GeneratedEndpointData<T> extends { data?: infer D } ? D : never;

type EndpointApiResponse<T extends (...args: any[]) => Promise<{ data: any }>> = ApiResponse<
  EndpointDataPayload<T>
>;

type AclInfoResponse = EndpointApiResponse<(typeof generatedApiClient)['aclInfo']['aclInfoList']>;
type AclClientsResponse = EndpointApiResponse<
  (typeof generatedApiClient)['aclClients']['aclClientsList']
>;
type AclRemoveClientResponse = EndpointApiResponse<
  (typeof generatedApiClient)['aclRemoveClient']['aclRemoveClientCreate']
>;
type AclStatsResponse = EndpointApiResponse<(typeof generatedApiClient)['aclStats']['aclStatsList']>;
type RoomMessagesResponse = EndpointApiResponse<
  (typeof generatedApiClient)['roomMessages']['roomMessagesList']
>;
type RoomPostMessageResponse = EndpointApiResponse<
  (typeof generatedApiClient)['roomPostMessage']['roomPostMessageCreate']
>;
type RoomMessagesClearResponse = EndpointApiResponse<
  (typeof generatedApiClient)['roomMessagesClear']['roomMessagesClearDelete']
>;
type RoomStatsResponse = EndpointApiResponse<(typeof generatedApiClient)['roomStats']['roomStatsList']>;
type RoomClientsResponse = EndpointApiResponse<
  (typeof generatedApiClient)['roomClients']['roomClientsList']
>;
type TransportKeysResponse = EndpointApiResponse<
  (typeof generatedApiClient)['transportKeys']['transportKeysList']
>;
type SendAdvertResponse = EndpointApiResponse<
  (typeof generatedApiClient)['sendAdvert']['sendAdvertCreate']
>;
type CreateTransportKeyResponse = EndpointApiResponse<
  (typeof generatedApiClient)['transportKeys']['transportKeysCreate']
>;
type TransportKeyResponse = EndpointApiResponse<
  (typeof generatedApiClient)['transportKey']['transportKeyList']
>;
type UpdateTransportKeyResponse = EndpointApiResponse<
  (typeof generatedApiClient)['transportKey']['transportKeyUpdate']
>;
type DeleteTransportKeyResponse = EndpointApiResponse<
  (typeof generatedApiClient)['transportKey']['transportKeyDelete']
>;
type UnscopedFloodPolicyResponse = EndpointApiResponse<
  (typeof generatedApiClient)['unscopedFloodPolicy']['unscopedFloodPolicyCreate']
>;
type DeleteAdvertResponse = EndpointApiResponse<(typeof generatedApiClient)['advert']['advertDelete']>;
type IdentitiesResponse = EndpointApiResponse<(typeof generatedApiClient)['identities']['identitiesList']>;
type IdentityResponse = EndpointApiResponse<(typeof generatedApiClient)['identity']['identityList']>;
type CreateIdentityResponse = EndpointApiResponse<
  (typeof generatedApiClient)['createIdentity']['createIdentityCreate']
>;
type UpdateIdentityResponse = EndpointApiResponse<
  (typeof generatedApiClient)['updateIdentity']['updateIdentityUpdate']
>;
type DeleteIdentityResponse = EndpointApiResponse<
  (typeof generatedApiClient)['deleteIdentity']['deleteIdentityDelete']
>;
type SendRoomServerAdvertResponse = EndpointApiResponse<
  (typeof generatedApiClient)['sendRoomServerAdvert']['sendRoomServerAdvertCreate']
>;
type ImportConfigResponse = EndpointApiResponse<
  (typeof generatedApiClient)['configImport']['configImportCreate']
>;

// API Response interface for consistent response structure
export interface ApiResponse<T = unknown> {
  success?: boolean;
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
    if (error.response?.status === 401 || error.response?.status === 403) {
      const requestToken = (error.config?.headers?.['Authorization'] as string | undefined)?.replace('Bearer ', '');
      const currentToken = getToken();
      if (!requestToken || requestToken === currentToken) {
        const appRuntime = useAppRuntimeStore();
        void appRuntime.handleAuthFailure(error.response?.status === 403 ? 'forbidden' : 'unauthorized');
      }
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
    if (error.response?.status === 401 || error.response?.status === 403) {
      const requestToken = (error.config?.headers?.['Authorization'] as string | undefined)?.replace('Bearer ', '');
      const currentToken = getToken();
      if (!requestToken || requestToken === currentToken) {
        const appRuntime = useAppRuntimeStore();
        void appRuntime.handleAuthFailure(error.response?.status === 403 ? 'forbidden' : 'unauthorized');
      }
    }

    console.error('API Response Error:', error.response?.data || error.message);
    return Promise.reject(error);
  },
);

// Generic API utility class
export class ApiService {
  private static async resolveRequestToken(): Promise<string | undefined> {
    const token = getToken();

    if (!token) {
      return undefined;
    }

    if (shouldRefreshToken()) {
      return refreshToken();
    }

    if (isTokenExpired()) {
      const appRuntime = useAppRuntimeStore();
      void appRuntime.handleAuthFailure('expired');
      throw new Error('Token expired');
    }

    return token;
  }

  private static async getGeneratedRequestParams(): Promise<RequestParams> {
    const token = await this.resolveRequestToken();
    if (!token) {
      return {};
    }

    return {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    };
  }

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
  static async getTransportKeys(): Promise<TransportKeysResponse> {
    try {
      const params = await this.getGeneratedRequestParams();
      const response = await generatedApiClient.transportKeys.transportKeysList(params);
      return response.data;
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  static async sendAdvert(): Promise<SendAdvertResponse> {
    try {
      const params = await this.getGeneratedRequestParams();
      const response = await generatedApiClient.sendAdvert.sendAdvertCreate(params);
      return response.data;
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  static async getGpsDiagnostics(): Promise<ApiResponse<GPSDiagnostics>> {
    try {
      const params = await this.getGeneratedRequestParams();
      const response = await generatedApiClient.gps.getGps(params);
      return response.data;
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  static async getSerialPorts(): Promise<
    ApiResponse<Array<{ device: string; description?: string }>>
  > {
    try {
      const params = await this.getGeneratedRequestParams();
      const response = await generatedApiClient.serialPorts.serialPortsList(params);
      return response.data;
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  static async createTransportKey(
    name: string,
    flood_policy: string,
    transport_key?: string,
    parent_id?: number,
    last_used?: string,
  ): Promise<CreateTransportKeyResponse> {
    const payload: {
      name: string;
      flood_policy: string;
      parent_id?: number;
      last_used?: string;
      transport_key?: string;
    } = {
      name,
      flood_policy,
      parent_id,
      last_used,
    };

    // Only include transport_key if provided
    if (transport_key !== undefined) {
      payload.transport_key = transport_key;
    }

    try {
      const params = await this.getGeneratedRequestParams();
      const response = await generatedApiClient.transportKeys.transportKeysCreate(payload, params);
      return response.data;
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  static async getTransportKey(id: number): Promise<TransportKeyResponse> {
    try {
      const params = await this.getGeneratedRequestParams();
      const response = await generatedApiClient.transportKey.transportKeyList(
        { key_id: String(id) },
        params,
      );
      return response.data;
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  static async updateTransportKey(
    id: number,
    name?: string,
    flood_policy?: string,
    transport_key?: string,
    parent_id?: number,
    last_used?: string,
  ): Promise<UpdateTransportKeyResponse> {
    try {
      const params = await this.getGeneratedRequestParams();
      const response = await generatedApiClient.transportKey.transportKeyUpdate(
        { key_id: String(id) },
        {
          name,
          flood_policy: flood_policy as 'allow' | 'deny' | undefined,
          transport_key,
          parent_id,
          last_used,
        },
        params,
      );
      return response.data;
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  static async deleteTransportKey(id: number): Promise<DeleteTransportKeyResponse> {
    try {
      const params = await this.getGeneratedRequestParams();
      const response = await generatedApiClient.transportKey.transportKeyDelete(
        { key_id: String(id) },
        params,
      );
      return response.data;
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  static async updateUnscopedFloodPolicy(allow: boolean): Promise<UnscopedFloodPolicyResponse> {
    try {
      const params = await this.getGeneratedRequestParams();
      const response = await generatedApiClient.unscopedFloodPolicy.unscopedFloodPolicyCreate(
        { unscoped_flood_allow: allow },
        params,
      );
      return response.data;
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  static async getLogs(): Promise<{
    logs: Array<{ message: string; timestamp: string; level: string }>;
  }> {
    try {
      const params = await this.getGeneratedRequestParams();
      const response = await generatedApiClient.logs.logsList(params);
      return response.data;
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  // Domain-specific methods for Neighbor management
  static async deleteAdvert(id: number): Promise<DeleteAdvertResponse> {
    try {
      const params = await this.getGeneratedRequestParams();
      const response = await generatedApiClient.advert.advertDelete(
        { advert_id: id },
        params,
      );
      return response.data;
    } catch (error: unknown) {
      throw this.handleError(error);
    }
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
    try {
      const params = await this.getGeneratedRequestParams();
      const response = await generatedApiClient.pingNeighbor.pingNeighborCreate(
        {
          target_id,
          timeout,
        },
        params,
      );
      return response.data;
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  // Domain-specific methods for Identity management
  static async getIdentities(): Promise<IdentitiesResponse> {
    try {
      const params = await this.getGeneratedRequestParams();
      const response = await generatedApiClient.identities.identitiesList(params);
      return response.data;
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  static async getIdentity(name: string): Promise<IdentityResponse> {
    try {
      const params = await this.getGeneratedRequestParams();
      const response = await generatedApiClient.identity.identityList({ name }, params);
      return response.data;
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  static async createIdentity(data: {
    name: string;
    identity_key: string;
    type: string;
    settings?: Record<string, unknown>;
  }): Promise<CreateIdentityResponse> {
    try {
      const params = await this.getGeneratedRequestParams();
      if (data.type !== 'repeater' && data.type !== 'room_server') {
        throw new Error(`Unsupported identity type: ${data.type}`);
      }
      const response = await generatedApiClient.createIdentity.createIdentityCreate(
        {
          name: data.name,
          identity_key: data.identity_key,
          type: data.type,
          settings: data.settings as
            | {
                admin_password?: string;
                guest_password?: string;
                max_posts?: number;
              }
            | undefined,
        },
        params,
      );
      return response.data;
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  static async updateIdentity(data: {
    name: string;
    new_name?: string;
    identity_key?: string;
    type?: 'room_server' | 'companion';
    settings?: Record<string, unknown>;
  }): Promise<UpdateIdentityResponse> {
    try {
      const params = await this.getGeneratedRequestParams();
      const payload = {
        type: data.type,
        name: data.name,
        new_name: data.new_name,
        identity_key: data.identity_key,
        settings: data.settings,
      };
      const response = await generatedApiClient.updateIdentity.updateIdentityUpdate(
        payload,
        params,
      );
      return response.data;
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  static async deleteIdentity(
    name: string,
    type: 'room_server' | 'companion' = 'room_server',
  ): Promise<DeleteIdentityResponse> {
    try {
      const params = await this.getGeneratedRequestParams();
      const response = await generatedApiClient.deleteIdentity.deleteIdentityDelete(
        {
          name,
          type,
        },
        params,
      );
      return response.data;
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  static async sendRoomServerAdvert(name: string): Promise<SendRoomServerAdvertResponse> {
    try {
      const params = await this.getGeneratedRequestParams();
      const response = await generatedApiClient.sendRoomServerAdvert.sendRoomServerAdvertCreate(
        { name },
        params,
      );
      return response.data;
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  static async importRepeaterContacts(data: {
    companion_name: string;
    contact_types?: string[];
    hours?: number;
    limit?: number;
  }): Promise<ApiResponse<{ imported: number }>> {
    try {
      const params = await this.getGeneratedRequestParams();
      const response = await generatedApiClient.companion.importRepeaterContactsCreate(
        data,
        params,
      );
      return response.data;
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  // Domain-specific methods for ACL management
  static async getACLInfo(): Promise<AclInfoResponse> {
    try {
      const params = await this.getGeneratedRequestParams();
      const response = await generatedApiClient.aclInfo.aclInfoList(params);
      return response.data;
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  static async getACLClients(params?: {
    identity_hash?: string;
    identity_name?: string;
  }): Promise<AclClientsResponse> {
    try {
      const requestParams = await this.getGeneratedRequestParams();
      const response = await generatedApiClient.aclClients.aclClientsList(params, requestParams);
      return response.data;
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  static async removeACLClient(data: {
    public_key: string;
    identity_hash?: string;
  }): Promise<AclRemoveClientResponse> {
    try {
      const params = await this.getGeneratedRequestParams();
      const response = await generatedApiClient.aclRemoveClient.aclRemoveClientCreate(
        {
          client_pubkey: data.public_key,
          identity_hash: data.identity_hash ?? '',
        },
        params,
      );
      return response.data;
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  static async getACLStats(): Promise<AclStatsResponse> {
    try {
      const params = await this.getGeneratedRequestParams();
      const response = await generatedApiClient.aclStats.aclStatsList(params);
      return response.data;
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  // Domain-specific methods for Room Messages
  static async getRoomMessages(params: {
    room_name?: string;
    room_hash?: string;
    limit?: number;
    offset?: number;
  }): Promise<RoomMessagesResponse> {
    try {
      const requestParams = await this.getGeneratedRequestParams();
      const response = await generatedApiClient.roomMessages.roomMessagesList(
        params,
        requestParams,
      );
      return response.data;
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  static async postRoomMessage(data: {
    room_name: string;
    message: string;
    author_pubkey: string;
    txt_type?: 0 | 2;
  }): Promise<RoomPostMessageResponse> {
    try {
      const params = await this.getGeneratedRequestParams();
      const response = await generatedApiClient.roomPostMessage.roomPostMessageCreate(data, params);
      return response.data;
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  static async deleteRoomMessage(params: {
    room_name: string;
    message_id: number;
  }): Promise<ApiResponse<never>> {
    try {
      const requestParams = await this.getGeneratedRequestParams();
      await generatedApiClient.roomMessage.roomMessageDelete(
        {
          room_name: params.room_name,
          message_id: params.message_id,
        },
        requestParams,
      );
      return { success: true };
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  static async clearRoomMessages(room_name: string): Promise<RoomMessagesClearResponse> {
    try {
      const params = await this.getGeneratedRequestParams();
      const response = await generatedApiClient.roomMessagesClear.roomMessagesClearDelete(
        { room_name },
        params,
      );
      return response.data;
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  static async getRoomStats(room_name?: string): Promise<RoomStatsResponse> {
    try {
      const params = await this.getGeneratedRequestParams();
      const response = await generatedApiClient.roomStats.roomStatsList(
        room_name ? { room_name } : undefined,
        params,
      );
      return response.data;
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  static async getRoomClients(room_name: string): Promise<RoomClientsResponse> {
    try {
      const params = await this.getGeneratedRequestParams();
      const response = await generatedApiClient.roomClients.roomClientsList({ room_name }, params);
      return response.data;
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  // ========================
  // Backup & Restore
  // ========================

  static async exportConfig(
    includeSecrets = false,
  ): Promise<
    ApiResponse<{
      meta: {
        exported_at: string;
        version: string;
        config_path: string;
        includes_secrets: boolean;
      };
      config: object;
    }>
  > {
    try {
      const params = await this.getGeneratedRequestParams();
      const response = await generatedApiClient.configExport.configExportList(
        includeSecrets ? { include_secrets: true } : undefined,
        params,
      );
      return response.data;
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  static async importConfig(config: Record<string, unknown>): Promise<ImportConfigResponse> {
    try {
      const params = await this.getGeneratedRequestParams();
      const response = await generatedApiClient.configImport.configImportCreate(
        { config },
        params,
      );
      return response.data;
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  static async exportIdentityKey(): Promise<
    ApiResponse<{
      identity_key_hex: string;
      key_length_bytes: number;
      public_key_hex?: string;
      node_address?: string;
    }>
  > {
    try {
      const params = await this.getGeneratedRequestParams();
      const response = await generatedApiClient.identityExport.identityExportList(params);
      return response.data;
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  static async generateVanityKey(
    prefix: string,
    apply: boolean = false,
  ): Promise<
    ApiResponse<{ public_hex: string; private_hex: string; attempts: number; applied?: boolean }>
  > {
    try {
      const params = await this.getGeneratedRequestParams();
      const response = await generatedApiClient.generateVanityKey.generateVanityKeyCreate(
        { prefix, apply },
        params,
      );
      return response.data;
    } catch (error: unknown) {
      throw this.handleError(error);
    }
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
    try {
      const params = await this.getGeneratedRequestParams();
      const response = await generatedApiClient.dbStats.dbStatsList(params);
      return response.data;
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  static async purgeTable(
    tables: string[] | 'all',
  ): Promise<ApiResponse<Record<string, { deleted?: number; error?: string }>>> {
    try {
      const params = await this.getGeneratedRequestParams();
      const response = await generatedApiClient.dbPurge.dbPurgeCreate({ tables }, params);
      return response.data;
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  static async vacuumDb(): Promise<
    ApiResponse<{ size_before: number; size_after: number; freed_bytes: number }>
  > {
    try {
      const params = await this.getGeneratedRequestParams();
      const response = await generatedApiClient.dbVacuum.dbVacuumCreate(params);
      return response.data;
    } catch (error: unknown) {
      throw this.handleError(error);
    }
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
