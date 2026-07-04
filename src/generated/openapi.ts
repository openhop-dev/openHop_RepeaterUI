/* eslint-disable */
/* tslint:disable */
// @ts-nocheck
/*
 * ---------------------------------------------------------------
 * ## THIS FILE WAS GENERATED VIA SWAGGER-TYPESCRIPT-API        ##
 * ##                                                           ##
 * ## AUTHOR: acacode                                           ##
 * ## SOURCE: https://github.com/acacode/swagger-typescript-api ##
 * ---------------------------------------------------------------
 */

export interface SuccessResponse {
  /** @example true */
  success?: boolean;
  /** Response data (varies by endpoint) */
  data?: object;
}

export interface ErrorResponse {
  /** @example false */
  success?: boolean;
  /** Error message */
  error?: string;
}

export interface RoomMessage {
  /**
   * Database message ID
   * @example 123
   */
  id: number;
  /**
   * Author's public key (64 hex chars):
   * - 32 zeros (64 '0's) = server/system message
   * - Other hex = regular user message
   * @pattern ^[0-9a-fA-F]{64}$|^00{64}$
   * @example "abc123def456..."
   */
  author_pubkey: string;
  /**
   * First 8 chars of author_pubkey (for display)
   * @pattern ^[0-9a-fA-F]{8}$
   * @example "abc123de"
   */
  author_prefix?: string;
  /**
   * Server timestamp when message was stored (Unix epoch)
   * @format float
   * @example 1734567890.5
   */
  post_timestamp: number;
  /**
   * Client-provided timestamp (may be inaccurate)
   * @example 1734567890
   */
  sender_timestamp?: number;
  /**
   * Message content (auto-truncated at 160 bytes)
   * @maxLength 160
   * @example "Hello world"
   */
  message_text: string;
  /**
   * Message type:
   * - 0: Plain text
   * - 2: Signed plain text
   * @example 0
   */
  txt_type: 0 | 2;
  /**
   * Database insertion timestamp (Unix epoch)
   * @format float
   * @example 1734567890.5
   */
  created_at?: number;
}

export interface RoomClient {
  /**
   * Client's public key (64 hex chars)
   * @pattern ^[0-9a-fA-F]{64}$
   * @example "abc123def456..."
   */
  pubkey: string;
  /**
   * First 8 chars of pubkey (for display)
   * @pattern ^[0-9a-fA-F]{8}$
   * @example "abc123de"
   */
  pubkey_prefix?: string;
  /**
   * Last sync timestamp (Unix epoch)
   * @format float
   * @example 1734567890.5
   */
  sync_since: number;
  /**
   * Number of new messages for this client (max 32, messages NOT sent to author)
   * @min 0
   * @max 32
   * @example 5
   */
  unsynced_count: number;
  /**
   * Waiting for ACK from client
   * @example false
   */
  pending_ack?: boolean;
  /**
   * Number of failed delivery attempts
   * @min 0
   * @example 0
   */
  push_failures?: number;
  /**
   * Last activity timestamp (Unix epoch)
   * @format float
   * @example 1734567890.5
   */
  last_activity?: number;
  /**
   * Client passes ACL check
   * @example true
   */
  in_acl?: boolean;
  /**
   * Client is currently active (synced within timeout period)
   * @example true
   */
  is_active: boolean;
}

export interface Identity {
  /**
   * Identity name (alphanumeric, spaces, hyphens, underscores)
   * @minLength 1
   * @maxLength 64
   * @pattern ^[a-zA-Z0-9_\-\s]+$
   * @example "General Chat"
   */
  name: string;
  /**
   * - repeater: Repeater identity (only one allowed per system)
   * - room_server: Room server for group chat
   * @example "room_server"
   */
  type: "repeater" | "room_server";
  /**
   * 1-byte identity hash (used in radio packets)
   * @pattern ^0x[0-9a-fA-F]{2}$
   * @example "0x42"
   */
  hash: string;
  /**
   * Ed25519 public key (64 hex chars)
   * @pattern ^[0-9a-fA-F]{64}$
   * @example "abc123def456..."
   */
  public_key: string;
  /** Type-specific settings */
  settings?: {
    /**
     * Admin password (room_server only)
     * @minLength 4
     * @example "admin123"
     */
    admin_password?: string;
    /**
     * Guest password (room_server only)
     * @minLength 4
     * @example "guest123"
     */
    guest_password?: string;
    /**
     * Maximum messages to keep (room_server only, hard limit 32)
     * @min 1
     * @max 32
     * @default 32
     * @example 32
     */
    max_posts?: number;
  };
}

export interface ACLClient {
  /**
   * Truncated public key for display (first 24 and last 8 chars)
   * @example "03ccf3bb0bed9a51...21416fff"
   */
  public_key: string;
  /**
   * Full client public key (64 hex chars)
   * @pattern ^[0-9a-fA-F]{64}$
   * @example "03ccf3bb0bed9a5109868a1e33ed020519aab6dbb30e42df3b11a21d21416fff"
   */
  public_key_full: string;
  /**
   * Client address identifier
   * @example "e1"
   */
  address: string;
  /**
   * Client permission level:
   * - admin: Full access
   * - guest: Limited access
   * - read_only: Read-only access
   * @example "admin"
   */
  permissions: "admin" | "guest" | "read_only";
  /**
   * Unix timestamp of last activity
   * @example 1766065148
   */
  last_activity?: number;
  /**
   * Unix timestamp of last successful login
   * @example 1766065146
   */
  last_login_success?: number;
  /**
   * Unix timestamp from last client message
   * @example 1766065146
   */
  last_timestamp?: number;
  /**
   * Name of the identity this client is authenticated to
   * @example "rrrrr"
   */
  identity_name?: string;
  /**
   * Type of identity
   * @example "room_server"
   */
  identity_type?: "repeater" | "room_server";
  /**
   * Hash of the identity
   * @pattern ^0x[0-9a-fA-F]{2}$
   * @example "0xC5"
   */
  identity_hash?: string;
}

export type QueryParamsType = Record<string | number, any>;
export type ResponseFormat = keyof Omit<Body, "body" | "bodyUsed">;

export interface FullRequestParams extends Omit<RequestInit, "body"> {
  /** set parameter to `true` for call `securityWorker` for this request */
  secure?: boolean;
  /** request path */
  path: string;
  /** content type of request body */
  type?: ContentType;
  /** query params */
  query?: QueryParamsType;
  /** format of response (i.e. response.json() -> format: "json") */
  format?: ResponseFormat;
  /** request body */
  body?: unknown;
  /** base url */
  baseUrl?: string;
  /** request cancellation token */
  cancelToken?: CancelToken;
}

export type RequestParams = Omit<
  FullRequestParams,
  "body" | "method" | "query" | "path"
>;

export interface ApiConfig<SecurityDataType = unknown> {
  baseUrl?: string;
  baseApiParams?: Omit<RequestParams, "baseUrl" | "cancelToken" | "signal">;
  securityWorker?: (
    securityData: SecurityDataType | null,
  ) => Promise<RequestParams | void> | RequestParams | void;
  customFetch?: typeof fetch;
}

export interface HttpResponse<D extends unknown, E extends unknown = unknown>
  extends Response {
  data: D;
  error: E;
}

type CancelToken = Symbol | string | number;

export enum ContentType {
  Json = "application/json",
  JsonApi = "application/vnd.api+json",
  FormData = "multipart/form-data",
  UrlEncoded = "application/x-www-form-urlencoded",
  Text = "text/plain",
}

export class HttpClient<SecurityDataType = unknown> {
  public baseUrl: string = "/api";
  private securityData: SecurityDataType | null = null;
  private securityWorker?: ApiConfig<SecurityDataType>["securityWorker"];
  private abortControllers = new Map<CancelToken, AbortController>();
  private customFetch = (...fetchParams: Parameters<typeof fetch>) =>
    fetch(...fetchParams);

  private baseApiParams: RequestParams = {
    credentials: "same-origin",
    headers: {},
    redirect: "follow",
    referrerPolicy: "no-referrer",
  };

  constructor(apiConfig: ApiConfig<SecurityDataType> = {}) {
    Object.assign(this, apiConfig);
  }

  public setSecurityData = (data: SecurityDataType | null) => {
    this.securityData = data;
  };

  protected encodeQueryParam(key: string, value: any) {
    const encodedKey = encodeURIComponent(key);
    return `${encodedKey}=${encodeURIComponent(typeof value === "number" ? value : `${value}`)}`;
  }

  protected addQueryParam(query: QueryParamsType, key: string) {
    return this.encodeQueryParam(key, query[key]);
  }

  protected addArrayQueryParam(query: QueryParamsType, key: string) {
    const value = query[key];
    return value.map((v: any) => this.encodeQueryParam(key, v)).join("&");
  }

  protected toQueryString(rawQuery?: QueryParamsType): string {
    const query = rawQuery || {};
    const keys = Object.keys(query).filter(
      (key) => "undefined" !== typeof query[key],
    );
    return keys
      .map((key) =>
        Array.isArray(query[key])
          ? this.addArrayQueryParam(query, key)
          : this.addQueryParam(query, key),
      )
      .join("&");
  }

  protected addQueryParams(rawQuery?: QueryParamsType): string {
    const queryString = this.toQueryString(rawQuery);
    return queryString ? `?${queryString}` : "";
  }

  private contentFormatters: Record<ContentType, (input: any) => any> = {
    [ContentType.Json]: (input: any) =>
      input !== null && (typeof input === "object" || typeof input === "string")
        ? JSON.stringify(input)
        : input,
    [ContentType.JsonApi]: (input: any) =>
      input !== null && (typeof input === "object" || typeof input === "string")
        ? JSON.stringify(input)
        : input,
    [ContentType.Text]: (input: any) =>
      input !== null && typeof input !== "string"
        ? JSON.stringify(input)
        : input,
    [ContentType.FormData]: (input: any) => {
      if (input instanceof FormData) {
        return input;
      }

      return Object.keys(input || {}).reduce((formData, key) => {
        const property = input[key];
        formData.append(
          key,
          property instanceof Blob
            ? property
            : typeof property === "object" && property !== null
              ? JSON.stringify(property)
              : `${property}`,
        );
        return formData;
      }, new FormData());
    },
    [ContentType.UrlEncoded]: (input: any) => this.toQueryString(input),
  };

  protected mergeRequestParams(
    params1: RequestParams,
    params2?: RequestParams,
  ): RequestParams {
    return {
      ...this.baseApiParams,
      ...params1,
      ...(params2 || {}),
      headers: {
        ...(this.baseApiParams.headers || {}),
        ...(params1.headers || {}),
        ...((params2 && params2.headers) || {}),
      },
    };
  }

  protected createAbortSignal = (
    cancelToken: CancelToken,
  ): AbortSignal | undefined => {
    if (this.abortControllers.has(cancelToken)) {
      const abortController = this.abortControllers.get(cancelToken);
      if (abortController) {
        return abortController.signal;
      }
      return void 0;
    }

    const abortController = new AbortController();
    this.abortControllers.set(cancelToken, abortController);
    return abortController.signal;
  };

  public abortRequest = (cancelToken: CancelToken) => {
    const abortController = this.abortControllers.get(cancelToken);

    if (abortController) {
      abortController.abort();
      this.abortControllers.delete(cancelToken);
    }
  };

  public request = async <T = any, E = any>({
    body,
    secure,
    path,
    type,
    query,
    format,
    baseUrl,
    cancelToken,
    ...params
  }: FullRequestParams): Promise<HttpResponse<T, E>> => {
    const secureParams =
      ((typeof secure === "boolean" ? secure : this.baseApiParams.secure) &&
        this.securityWorker &&
        (await this.securityWorker(this.securityData))) ||
      {};
    const requestParams = this.mergeRequestParams(params, secureParams);
    const queryString = query && this.toQueryString(query);
    const payloadFormatter = this.contentFormatters[type || ContentType.Json];
    const responseFormat = format || requestParams.format;

    return this.customFetch(
      `${baseUrl || this.baseUrl || ""}${path}${queryString ? `?${queryString}` : ""}`,
      {
        ...requestParams,
        headers: {
          ...(requestParams.headers || {}),
          ...(type && type !== ContentType.FormData
            ? { "Content-Type": type }
            : {}),
        },
        signal:
          (cancelToken
            ? this.createAbortSignal(cancelToken)
            : requestParams.signal) || null,
        body:
          typeof body === "undefined" || body === null
            ? null
            : payloadFormatter(body),
      },
    ).then(async (response) => {
      const r = response as HttpResponse<T, E>;
      r.data = null as unknown as T;
      r.error = null as unknown as E;

      const responseToParse = responseFormat ? response.clone() : response;
      const data = !responseFormat
        ? r
        : await responseToParse[responseFormat]()
            .then((data) => {
              if (r.ok) {
                r.data = data;
              } else {
                r.error = data;
              }
              return r;
            })
            .catch((e) => {
              r.error = e;
              return r;
            });

      if (cancelToken) {
        this.abortControllers.delete(cancelToken);
      }

      if (!response.ok) throw data;
      return data;
    });
  };
}

/**
 * @title openHop Repeater API
 * @version 1.0.0
 * @baseUrl /api
 * @contact openHop Repeater (https://github.com/openhop-dev/openhop_repeater)
 *
 * REST API for openHop Repeater - LoRa mesh network repeater with room server functionality.
 *
 * ## Features
 * - System statistics and monitoring
 * - Packet history and analysis
 * - Identity management
 * - Access Control Lists (ACL)
 * - Room server messaging
 * - CAD calibration
 * - Noise floor monitoring
 */
export class Api<
  SecurityDataType extends unknown,
> extends HttpClient<SecurityDataType> {
  auth = {
    /**
     * @description Authenticate with username/password and receive JWT token
     *
     * @tags Authentication
     * @name LoginCreate
     * @summary User login
     * @request POST:/auth/login
     */
    loginCreate: (
      data: {
        /** @example "admin" */
        username: string;
        /**
         * @format password
         * @example "admin123"
         */
        password: string;
        /**
         * Unique client identifier
         * @example "web-client-abc123"
         */
        client_id: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          success?: boolean;
          /** JWT token */
          token?: string;
          /** Token expiry in seconds */
          expires_in?: number;
          username?: string;
        },
        void
      >({
        path: `/auth/login`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * @description Extend session by refreshing JWT token
     *
     * @tags Authentication
     * @name RefreshCreate
     * @summary Refresh JWT token
     * @request POST:/auth/refresh
     * @secure
     */
    refreshCreate: (
      data: {
        client_id: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          success?: boolean;
          token?: string;
          expires_in?: number;
          username?: string;
        },
        any
      >({
        path: `/auth/refresh`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * @description Check if current authentication is valid
     *
     * @tags Authentication
     * @name VerifyList
     * @summary Verify authentication
     * @request GET:/auth/verify
     * @secure
     */
    verifyList: (params: RequestParams = {}) =>
      this.request<
        {
          success?: boolean;
          authenticated?: boolean;
          user?: object;
        },
        any
      >({
        path: `/auth/verify`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Change the admin password (requires authentication)
     *
     * @tags Authentication
     * @name ChangePasswordCreate
     * @summary Change admin password
     * @request POST:/auth/change_password
     * @secure
     */
    changePasswordCreate: (
      data: {
        /** @format password */
        current_password: string;
        /**
         * @format password
         * @minLength 8
         */
        new_password: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<void, void>({
        path: `/auth/change_password`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        ...params,
      }),

    /**
     * @description Get list of all API tokens (RESTful endpoint)
     *
     * @tags Authentication
     * @name TokensList
     * @summary List API tokens
     * @request GET:/auth/tokens
     * @secure
     */
    tokensList: (params: RequestParams = {}) =>
      this.request<
        {
          success?: boolean;
          tokens?: {
            id?: number;
            name?: string;
            /** @format date-time */
            created_at?: string;
            /** @format date-time */
            last_used?: string;
          }[];
        },
        any
      >({
        path: `/auth/tokens`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Generate a new API token (RESTful endpoint)
     *
     * @tags Authentication
     * @name TokensCreate
     * @summary Create API token
     * @request POST:/auth/tokens
     * @secure
     */
    tokensCreate: (
      data: {
        /**
         * Friendly name for the token
         * @example "My API Token"
         */
        name: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          success?: boolean;
          /** The plaintext token (only shown once) */
          token?: string;
          token_id?: number;
          name?: string;
          warning?: string;
        },
        any
      >({
        path: `/auth/tokens`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * @description Delete/revoke an API token by ID (RESTful endpoint)
     *
     * @tags Authentication
     * @name TokensDelete
     * @summary Revoke API token
     * @request DELETE:/auth/tokens/{token_id}
     * @secure
     */
    tokensDelete: (tokenId: number, params: RequestParams = {}) =>
      this.request<void, void>({
        path: `/auth/tokens/${tokenId}`,
        method: "DELETE",
        secure: true,
        ...params,
      }),
  };
  stats = {
    /**
     * @description Returns repeater uptime, packet counts, and version information
     *
     * @tags System
     * @name StatsList
     * @summary Get system statistics
     * @request GET:/stats
     */
    statsList: (params: RequestParams = {}) =>
      this.request<
        {
          /** @example 3600 */
          uptime_secs?: number;
          /** @example 150 */
          packets_received?: number;
          /** @example 120 */
          packets_sent?: number;
          /** @example "1.0.0" */
          version?: string;
          /** @example "0.5.0" */
          core_version?: string;
        },
        any
      >({
        path: `/stats`,
        method: "GET",
        format: "json",
        ...params,
      }),
  };
  gps = {
    /**
     * @description Returns parsed NMEA fix, position, motion, accuracy, satellites, and raw sentence health.
     *
     * @tags GPS
     * @name GetGps
     * @summary Get local GPS diagnostics
     * @request GET:/gps
     * @secure
     */
    getGps: (params: RequestParams = {}) =>
      this.request<
        {
          success?: boolean;
          data?: {
            enabled?: boolean;
            running?: boolean;
            status?: object;
            fix?: object;
            /** Effective receiver position for API clients */
            position?: object;
            /** Raw position reported by the GPS receiver, even before a valid fix */
            gps_position?: object;
            /** Configured repeater latitude/longitude, when set to a non-zero coordinate */
            manual_position?: object | null;
            position_meta?: {
              source?: "gps" | "manual_config";
              source_label?: string;
              policy?: "manual_until_gps_fix" | "gps_only";
              manual_config_available?: boolean;
              gps_fix_valid?: boolean;
            };
            motion?: object;
            accuracy?: object;
            time?: object;
            /** GPS-to-system-clock sync status */
            time_sync?: {
              enabled?: boolean;
              state?:
                | "disabled"
                | "waiting_for_fix"
                | "waiting_for_time"
                | "ready"
                | "in_sync"
                | "synced"
                | "error"
                | "ignored";
              last_attempt?: string | null;
              last_success?: string | null;
              last_error?: string | null;
              last_gps_time?: string | null;
              last_offset_seconds?: number | null;
            };
            /** GPS-fix-to-repeater-location update status */
            location_update?: {
              enabled?: boolean;
              state?:
                | "disabled"
                | "unconfigured"
                | "waiting_for_fix"
                | "waiting_for_position"
                | "ready"
                | "updated"
                | "skipped"
                | "error";
              last_attempt?: string | null;
              last_success?: string | null;
              last_error?: string | null;
              last_latitude?: number | null;
              last_longitude?: number | null;
            };
            satellites?: object;
            nmea?: object;
            raw_attributes?: Record<string, any>;
          };
        },
        any
      >({
        path: `/gps`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),
  };
  gpsStream = {
    /**
     * @description Server-Sent Events stream of live GPS diagnostics snapshots.
     *
     * @tags GPS
     * @name GpsStreamList
     * @summary GPS diagnostics SSE stream
     * @request GET:/gps_stream
     */
    gpsStreamList: (params: RequestParams = {}) =>
      this.request<string, any>({
        path: `/gps_stream`,
        method: "GET",
        ...params,
      }),
  };
  sendAdvert = {
    /**
     * @description Manually trigger sending a repeater advertisement packet
     *
     * @tags System
     * @name SendAdvertCreate
     * @summary Send repeater advertisement
     * @request POST:/send_advert
     */
    sendAdvertCreate: (params: RequestParams = {}) =>
      this.request<SuccessResponse, void>({
        path: `/send_advert`,
        method: "POST",
        format: "json",
        ...params,
      }),
  };
  logs = {
    /**
     * @description Retrieve recent system logs
     *
     * @tags System
     * @name LogsList
     * @summary Get system logs
     * @request GET:/logs
     */
    logsList: (params: RequestParams = {}) =>
      this.request<
        {
          logs: {
            message: string;
            /** @format date-time */
            timestamp: string;
            level: string;
          }[];
          error?: string;
        },
        any
      >({
        path: `/logs`,
        method: "GET",
        format: "json",
        ...params,
      }),
  };
  logsStream = {
    /**
     * @description Server-Sent Events stream of live system log entries.
     *
     * @tags System
     * @name LogsStreamList
     * @summary Stream system logs
     * @request GET:/logs_stream
     */
    logsStreamList: (
      query?: {
        /** Resume the stream after this log entry id. */
        since_id?: number;
      },
      params: RequestParams = {},
    ) =>
      this.request<string, any>({
        path: `/logs_stream`,
        method: "GET",
        query: query,
        ...params,
      }),
  };
  hardwareStats = {
    /**
     * @description CPU, memory, disk usage statistics
     *
     * @tags System
     * @name HardwareStatsList
     * @summary Get hardware statistics
     * @request GET:/hardware_stats
     */
    hardwareStatsList: (params: RequestParams = {}) =>
      this.request<
        {
          cpu_percent?: number;
          memory_percent?: number;
          disk_usage?: object;
        },
        any
      >({
        path: `/hardware_stats`,
        method: "GET",
        format: "json",
        ...params,
      }),
  };
  hardwareProcesses = {
    /**
     * @description List running processes and their resource usage
     *
     * @tags System
     * @name HardwareProcessesList
     * @summary Get process information
     * @request GET:/hardware_processes
     */
    hardwareProcessesList: (params: RequestParams = {}) =>
      this.request<object[], any>({
        path: `/hardware_processes`,
        method: "GET",
        format: "json",
        ...params,
      }),
  };
  restartService = {
    /**
     * @description Restart the repeater daemon service
     *
     * @tags System
     * @name RestartServiceCreate
     * @summary Restart repeater service
     * @request POST:/restart_service
     * @secure
     */
    restartServiceCreate: (params: RequestParams = {}) =>
      this.request<SuccessResponse, any>({
        path: `/restart_service`,
        method: "POST",
        secure: true,
        format: "json",
        ...params,
      }),
  };
  validateConfig = {
    /**
     * @description Checks config syntax and required settings for the selected radio type.
     *
     * @tags System
     * @name ValidateConfigList
     * @summary Validate config.yaml before restart
     * @request GET:/validate_config
     * @secure
     */
    validateConfigList: (params: RequestParams = {}) =>
      this.request<
        {
          success?: boolean;
          data?: {
            valid?: boolean;
            blocked_restart?: boolean;
            errors?: {
              path?: string;
              message?: string;
            }[];
            warnings?: {
              path?: string;
              message?: string;
            }[];
            summary?: {
              error_count?: number;
              warning_count?: number;
            };
            config_path?: string;
            message?: string;
          };
        },
        any
      >({
        path: `/validate_config`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),
  };
  openapi = {
    /**
     * @description Returns the OpenAPI/Swagger specification for this API
     *
     * @tags System
     * @name OpenapiList
     * @summary Get OpenAPI specification
     * @request GET:/openapi
     */
    openapiList: (params: RequestParams = {}) =>
      this.request<object, any>({
        path: `/openapi`,
        method: "GET",
        format: "json",
        ...params,
      }),
  };
  setMode = {
    /**
     * @description Set TX mode. forward = repeat on; monitor = no repeat but companions/tenants can send; no_tx = all transmission disabled (receive-only).
     *
     * @tags System
     * @name SetModeCreate
     * @summary Set repeater mode
     * @request POST:/set_mode
     */
    setModeCreate: (
      data: {
        /**
         * - forward: Repeat received packets; allow all local TX (default)
         * - monitor: Do not repeat; allow local TX (companions, adverts, etc.)
         * - no_tx: Do not repeat; no local TX (receive-only)
         * @example "forward"
         */
        mode: "forward" | "monitor" | "no_tx";
      },
      params: RequestParams = {},
    ) =>
      this.request<SuccessResponse, ErrorResponse>({
        path: `/set_mode`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),
  };
  packetStats = {
    /**
     * @description Returns packet counts, types, and routing statistics
     *
     * @tags Packets
     * @name PacketStatsList
     * @summary Get packet statistics
     * @request GET:/packet_stats
     */
    packetStatsList: (
      query?: {
        /**
         * Time range in hours (1-168 = 1 hour to 1 week)
         * @min 1
         * @max 168
         * @default 24
         * @example 24
         */
        hours?: number;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          success?: boolean;
          data?: {
            total_packets?: number;
            received?: number;
            transmitted?: number;
            dropped?: number;
            by_type?: object;
            by_route?: object;
          };
        },
        any
      >({
        path: `/packet_stats`,
        method: "GET",
        query: query,
        format: "json",
        ...params,
      }),
  };
  setDutyCycle = {
    /**
     * @description Enable or disable duty cycle limiting
     *
     * @tags System
     * @name SetDutyCycleCreate
     * @summary Set duty cycle
     * @request POST:/set_duty_cycle
     */
    setDutyCycleCreate: (
      data: {
        /**
         * Enable duty cycle limiting
         * @example true
         */
        enabled: boolean;
      },
      params: RequestParams = {},
    ) =>
      this.request<SuccessResponse, any>({
        path: `/set_duty_cycle`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),
  };
  updateDutyCycleConfig = {
    /**
     * @description Update detailed duty cycle timing configuration
     *
     * @tags System
     * @name UpdateDutyCycleConfigCreate
     * @summary Update duty cycle configuration
     * @request POST:/update_duty_cycle_config
     * @secure
     */
    updateDutyCycleConfigCreate: (
      data: {
        enabled?: boolean;
        /** ON time in seconds */
        on_time?: number;
        /** OFF time in seconds */
        off_time?: number;
      },
      params: RequestParams = {},
    ) =>
      this.request<SuccessResponse, any>({
        path: `/update_duty_cycle_config`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),
  };
  updateRadioConfig = {
    /**
     * @description Update LoRa radio parameters
     *
     * @tags System
     * @name UpdateRadioConfigCreate
     * @summary Update radio configuration
     * @request POST:/update_radio_config
     * @secure
     */
    updateRadioConfigCreate: (data: object, params: RequestParams = {}) =>
      this.request<SuccessResponse, any>({
        path: `/update_radio_config`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),
  };
  recentPackets = {
    /**
     * @description Retrieve recent packet history
     *
     * @tags Packets
     * @name RecentPacketsList
     * @summary Get recent packets
     * @request GET:/recent_packets
     */
    recentPacketsList: (
      query?: {
        /**
         * Maximum number of packets to return
         * @min 1
         * @max 1000
         * @default 100
         */
        limit?: number;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          success?: boolean;
          data?: object[];
        },
        any
      >({
        path: `/recent_packets`,
        method: "GET",
        query: query,
        format: "json",
        ...params,
      }),
  };
  packetByHash = {
    /**
     * No description
     *
     * @tags Packets
     * @name PacketByHashList
     * @summary Get packet by hash
     * @request GET:/packet_by_hash
     */
    packetByHashList: (
      query: {
        /** Packet hash to lookup */
        packet_hash: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<void, any>({
        path: `/packet_by_hash`,
        method: "GET",
        query: query,
        ...params,
      }),
  };
  packetById = {
    /**
     * No description
     *
     * @tags Packets
     * @name PacketByIdList
     * @summary Get packet by ID
     * @request GET:/packet_by_id
     */
    packetByIdList: (
      query: {
        /** Packet database ID to lookup */
        packet_id: number;
      },
      params: RequestParams = {},
    ) =>
      this.request<void, any>({
        path: `/packet_by_id`,
        method: "GET",
        query: query,
        ...params,
      }),
  };
  packetTypeStats = {
    /**
     * @description Statistics broken down by packet type
     *
     * @tags Packets
     * @name PacketTypeStatsList
     * @summary Get packet type statistics
     * @request GET:/packet_type_stats
     */
    packetTypeStatsList: (
      query?: {
        /**
         * Time range in hours
         * @default 24
         */
        hours?: number;
      },
      params: RequestParams = {},
    ) =>
      this.request<object, any>({
        path: `/packet_type_stats`,
        method: "GET",
        query: query,
        format: "json",
        ...params,
      }),
  };
  routeStats = {
    /**
     * @description Statistics broken down by route type
     *
     * @tags Packets
     * @name RouteStatsList
     * @summary Get route statistics
     * @request GET:/route_stats
     */
    routeStatsList: (
      query?: {
        /**
         * Time range in hours
         * @default 24
         */
        hours?: number;
      },
      params: RequestParams = {},
    ) =>
      this.request<object, any>({
        path: `/route_stats`,
        method: "GET",
        query: query,
        format: "json",
        ...params,
      }),
  };
  filteredPackets = {
    /**
     * @description Retrieve packets filtered by type, route, and timestamp
     *
     * @tags Packets
     * @name FilteredPacketsList
     * @summary Get filtered packets
     * @request GET:/filtered_packets
     */
    filteredPacketsList: (
      query?: {
        /**
         * Packet type filter
         * @min 0
         * @max 15
         */
        type?: number;
        /**
         * Route type filter
         * @min 1
         * @max 3
         */
        route?: number;
        /** Start timestamp (Unix) */
        start_timestamp?: number;
        /** End timestamp (Unix) */
        end_timestamp?: number;
        /**
         * Maximum results
         * @default 1000
         */
        limit?: number;
      },
      params: RequestParams = {},
    ) =>
      this.request<object, any>({
        path: `/filtered_packets`,
        method: "GET",
        query: query,
        format: "json",
        ...params,
      }),
  };
  rrdData = {
    /**
     * @description Retrieve Round-Robin Database metrics for graphing. **Note:** This endpoint extracts parameters from the request internally. Parameters are handled automatically by the backend.
     *
     * @tags Charts
     * @name RrdDataList
     * @summary Get RRD time-series data
     * @request GET:/rrd_data
     */
    rrdDataList: (params: RequestParams = {}) =>
      this.request<
        {
          success?: boolean;
          data?: {
            start_time?: number;
            end_time?: number;
            step?: number;
            timestamps?: number[];
            metrics?: object;
          };
        },
        any
      >({
        path: `/rrd_data`,
        method: "GET",
        format: "json",
        ...params,
      }),
  };
  packetTypeGraphData = {
    /**
     * @description Returns bar chart data showing packet counts by type
     *
     * @tags Charts
     * @name PacketTypeGraphDataList
     * @summary Get packet type distribution graph data
     * @request GET:/packet_type_graph_data
     */
    packetTypeGraphDataList: (
      query?: {
        /**
         * Time range in hours
         * @default 24
         */
        hours?: number;
        /** @default "average" */
        resolution?: "average" | "max" | "min";
        /**
         * Comma-separated packet types or 'all'
         * @default "all"
         */
        types?: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          success?: boolean;
          data?: {
            start_time?: number;
            end_time?: number;
            step?: number;
            /** @example "bar" */
            chart_type?: string;
            series?: {
              name?: string;
              type?: string;
              data?: number[];
            }[];
          };
        },
        any
      >({
        path: `/packet_type_graph_data`,
        method: "GET",
        query: query,
        format: "json",
        ...params,
      }),
  };
  metricsGraphData = {
    /**
     * @description Returns time-series data for system metrics like packet counts, RSSI, SNR, etc. Available metrics: - rx_count: Received packets - tx_count: Transmitted packets - drop_count: Dropped packets - avg_rssi: Average RSSI (dBm) - avg_snr: Average SNR (dB) - avg_length: Average packet length - avg_score: Average score - neighbor_count: Neighbor count
     *
     * @tags Charts
     * @name MetricsGraphDataList
     * @summary Get system metrics graph data
     * @request GET:/metrics_graph_data
     */
    metricsGraphDataList: (
      query?: {
        /**
         * Time range in hours
         * @default 24
         */
        hours?: number;
        /** @default "average" */
        resolution?: "average" | "max" | "min";
        /**
         * Comma-separated metric names or 'all'
         * @default "all"
         * @example "rx_count,tx_count,avg_rssi"
         */
        metrics?: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          success?: boolean;
          data?: {
            start_time?: number;
            end_time?: number;
            step?: number;
            timestamps?: number[];
            series?: {
              name?: string;
              type?: string;
              data?: number[];
            }[];
          };
        },
        any
      >({
        path: `/metrics_graph_data`,
        method: "GET",
        query: query,
        format: "json",
        ...params,
      }),
  };
  noiseFloorHistory = {
    /**
     * @description Retrieve historical noise floor measurements
     *
     * @tags Noise Floor
     * @name NoiseFloorHistoryList
     * @summary Get noise floor history
     * @request GET:/noise_floor_history
     */
    noiseFloorHistoryList: (
      query?: {
        /**
         * Time range in hours
         * @min 1
         * @max 168
         * @default 24
         */
        hours?: number;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          success?: boolean;
          data?: object[];
        },
        any
      >({
        path: `/noise_floor_history`,
        method: "GET",
        query: query,
        format: "json",
        ...params,
      }),
  };
  noiseFloorStats = {
    /**
     * @description Statistical analysis of noise floor measurements
     *
     * @tags Noise Floor
     * @name NoiseFloorStatsList
     * @summary Get noise floor statistics
     * @request GET:/noise_floor_stats
     */
    noiseFloorStatsList: (
      query?: {
        /**
         * Time range in hours
         * @default 24
         */
        hours?: number;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          success?: boolean;
          data?: {
            min?: number;
            max?: number;
            avg?: number;
            current?: number;
          };
        },
        any
      >({
        path: `/noise_floor_stats`,
        method: "GET",
        query: query,
        format: "json",
        ...params,
      }),
  };
  noiseFloorChartData = {
    /**
     * @description Formatted noise floor data for charting
     *
     * @tags Noise Floor
     * @name NoiseFloorChartDataList
     * @summary Get noise floor chart data
     * @request GET:/noise_floor_chart_data
     */
    noiseFloorChartDataList: (
      query?: {
        /**
         * Time range in hours
         * @default 24
         */
        hours?: number;
      },
      params: RequestParams = {},
    ) =>
      this.request<object, any>({
        path: `/noise_floor_chart_data`,
        method: "GET",
        query: query,
        format: "json",
        ...params,
      }),
  };
  cadCalibrationStart = {
    /**
     * @description Begin Channel Activity Detection calibration process
     *
     * @tags CAD Calibration
     * @name CadCalibrationStartCreate
     * @summary Start CAD calibration
     * @request POST:/cad_calibration_start
     */
    cadCalibrationStartCreate: (
      data: {
        /**
         * Number of samples to collect
         * @min 1
         * @max 64
         * @default 8
         * @example 8
         */
        samples?: number;
        /**
         * Delay between samples in milliseconds
         * @min 10
         * @max 1000
         * @default 100
         * @example 100
         */
        delay?: number;
      },
      params: RequestParams = {},
    ) =>
      this.request<SuccessResponse, any>({
        path: `/cad_calibration_start`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),
  };
  cadCalibrationStop = {
    /**
     * No description
     *
     * @tags CAD Calibration
     * @name CadCalibrationStopCreate
     * @summary Stop CAD calibration
     * @request POST:/cad_calibration_stop
     */
    cadCalibrationStopCreate: (params: RequestParams = {}) =>
      this.request<SuccessResponse, any>({
        path: `/cad_calibration_stop`,
        method: "POST",
        format: "json",
        ...params,
      }),
  };
  saveCadSettings = {
    /**
     * @description Save calibrated CAD peak and min values to configuration
     *
     * @tags CAD Calibration
     * @name SaveCadSettingsCreate
     * @summary Save CAD settings
     * @request POST:/save_cad_settings
     * @secure
     */
    saveCadSettingsCreate: (
      data: {
        /**
         * CAD peak value
         * @min 0
         * @max 255
         * @example 127
         */
        peak: number;
        /**
         * CAD minimum value
         * @min 0
         * @max 255
         * @example 64
         */
        min_val: number;
      },
      params: RequestParams = {},
    ) =>
      this.request<SuccessResponse, any>({
        path: `/save_cad_settings`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),
  };
  cadCalibrationStream = {
    /**
     * @description Server-Sent Events stream of calibration progress
     *
     * @tags CAD Calibration
     * @name CadCalibrationStreamList
     * @summary CAD calibration SSE stream
     * @request GET:/cad_calibration_stream
     */
    cadCalibrationStreamList: (params: RequestParams = {}) =>
      this.request<string, any>({
        path: `/cad_calibration_stream`,
        method: "GET",
        ...params,
      }),
  };
  advertsByContactType = {
    /**
     * @description Retrieve advertisements filtered by contact type
     *
     * @tags Adverts
     * @name AdvertsByContactTypeList
     * @summary Get adverts by contact type
     * @request GET:/adverts_by_contact_type
     */
    advertsByContactTypeList: (
      query?: {
        /** Contact type to filter by */
        contact_type?: number;
        /**
         * Maximum number of results
         * @default 100
         */
        limit?: number;
        /**
         * Time range in hours
         * @default 24
         */
        hours?: number;
      },
      params: RequestParams = {},
    ) =>
      this.request<object, any>({
        path: `/adverts_by_contact_type`,
        method: "GET",
        query: query,
        format: "json",
        ...params,
      }),
  };
  advert = {
    /**
     * @description Delete a specific advertisement by ID
     *
     * @tags Adverts
     * @name AdvertDelete
     * @summary Delete specific advert
     * @request DELETE:/advert
     */
    advertDelete: (
      query: {
        /** Advert ID to delete */
        advert_id: number;
      },
      params: RequestParams = {},
    ) =>
      this.request<object, any>({
        path: `/advert`,
        method: "DELETE",
        query: query,
        format: "json",
        ...params,
      }),
  };
  transportKeys = {
    /**
     * @description Get list of all transport encryption keys
     *
     * @tags Transport Keys
     * @name TransportKeysList
     * @summary List transport keys
     * @request GET:/transport_keys
     * @secure
     */
    transportKeysList: (params: RequestParams = {}) =>
      this.request<
        {
          success?: boolean;
          data?: object[];
        },
        any
      >({
        path: `/transport_keys`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Generate a new transport encryption key
     *
     * @tags Transport Keys
     * @name TransportKeysCreate
     * @summary Create transport key
     * @request POST:/transport_keys
     * @secure
     */
    transportKeysCreate: (
      data: {
        /** Key name/identifier */
        name?: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<SuccessResponse, any>({
        path: `/transport_keys`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),
  };
  transportKey = {
    /**
     * @description Retrieve specific transport key details
     *
     * @tags Transport Keys
     * @name TransportKeyList
     * @summary Get transport key
     * @request GET:/transport_key
     * @secure
     */
    transportKeyList: (
      query: {
        /** Key ID to retrieve */
        key_id: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<object, any>({
        path: `/transport_key`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Update an existing transport encryption key
     *
     * @tags Transport Keys
     * @name TransportKeyUpdate
     * @summary Update transport key
     * @request PUT:/transport_key
     * @secure
     */
    transportKeyUpdate: (
      query: {
        /** Key ID to update */
        key_id: string;
      },
      data: {
        /** Updated key name */
        name?: string;
        /** Updated flood policy */
        flood_policy?: "allow" | "deny";
        /** Updated transport key hex */
        transport_key?: string;
        /** Updated parent transport key ID */
        parent_id?: number | null;
        /**
         * Updated last-used timestamp in ISO-8601 format
         * @format date-time
         */
        last_used?: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<SuccessResponse, any>({
        path: `/transport_key`,
        method: "PUT",
        query: query,
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * @description Remove a transport encryption key
     *
     * @tags Transport Keys
     * @name TransportKeyDelete
     * @summary Delete transport key
     * @request DELETE:/transport_key
     * @secure
     */
    transportKeyDelete: (
      query: {
        /** Key ID to delete */
        key_id: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<SuccessResponse, any>({
        path: `/transport_key`,
        method: "DELETE",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),
  };
  unscopedFloodPolicy = {
    /**
     * @description Modify network flood policy settings
     *
     * @tags Network Policy
     * @name UnscopedFloodPolicyCreate
     * @summary Update unscoped flood policy
     * @request POST:/unscoped_flood_policy
     * @secure
     */
    unscopedFloodPolicyCreate: (data: object, params: RequestParams = {}) =>
      this.request<SuccessResponse, any>({
        path: `/unscoped_flood_policy`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),
  };
  pingNeighbor = {
    /**
     * @description Send ping to a specific neighbor node
     *
     * @tags Network Policy
     * @name PingNeighborCreate
     * @summary Ping neighbor node
     * @request POST:/ping_neighbor
     * @secure
     */
    pingNeighborCreate: (
      data: {
        /** Target node identifier */
        target_id: string;
        /**
         * Ping timeout in seconds
         * @default 10
         */
        timeout?: number;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          success: boolean;
          data: {
            target_id: string;
            rtt_ms: number;
            snr_db: number;
            rssi: number;
            path: string[];
            tag: number;
            path_hash_mode?: number;
          };
          message?: string;
          error?: string;
        },
        any
      >({
        path: `/ping_neighbor`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),
  };
  discoverNeighborsStart = {
    /**
     * @description Start a short-lived discovery broadcast session and return a session ID for SSE streaming.
     *
     * @tags Network Policy
     * @name DiscoverNeighborsStartCreate
     * @summary Start neighbor discovery session
     * @request POST:/discover_neighbors_start
     */
    discoverNeighborsStartCreate: (
      data?: {
        /**
         * @min 1
         * @max 60
         * @default 5
         */
        timeout?: number;
        /**
         * @min 0
         * @max 255
         * @default 4
         */
        filter_mask?: number;
        /**
         * @min 0
         * @default 0
         */
        since?: number;
        /** @default false */
        prefix_only?: boolean;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          success?: boolean;
          data?: {
            session_id?: string;
            tag?: number;
            status?: string;
            timeout?: number;
            filter_mask?: number;
            since?: number;
            prefix_only?: boolean;
            created_at?: number;
            started_at?: number | null;
            completed_at?: number | null;
            count?: number;
            error?: string | null;
          };
          message?: string;
          error?: string;
        },
        any
      >({
        path: `/discover_neighbors_start`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),
  };
  discoverNeighborsStream = {
    /**
     * @description Stream live neighbor discovery session events via Server-Sent Events (SSE).
     *
     * @tags Network Policy
     * @name DiscoverNeighborsStreamList
     * @summary Stream discovery events
     * @request GET:/discover_neighbors_stream
     * @secure
     */
    discoverNeighborsStreamList: (
      query: {
        session_id: string;
        last_event_id?: number;
        /** JWT token for EventSource clients that cannot send Authorization headers. */
        token?: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<string, any>({
        path: `/discover_neighbors_stream`,
        method: "GET",
        query: query,
        secure: true,
        ...params,
      }),
  };
  addDiscoveredNeighbor = {
    /**
     * @description Persist a discovered node into the adverts/neighbors store for future management.
     *
     * @tags Network Policy
     * @name AddDiscoveredNeighborCreate
     * @summary Add discovered node as neighbor
     * @request POST:/add_discovered_neighbor
     * @secure
     */
    addDiscoveredNeighborCreate: (
      data: {
        /** Hex pubkey (8-byte or 32-byte form). */
        pub_key: string;
        node_name?: string | null;
        node_type?: number;
        rssi?: number | null;
        response_snr?: number | null;
        snr?: number | null;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          success?: boolean;
          data?: object;
          message?: string;
          error?: string;
        },
        any
      >({
        path: `/add_discovered_neighbor`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),
  };
  policy = {
    /**
     * @description Returns normalized policy engine configuration and grouped channel hash/pubkey entries.
     *
     * @tags Network Policy
     * @name PolicyList
     * @summary Get policy document
     * @request GET:/policy
     * @secure
     */
    policyList: (params: RequestParams = {}) =>
      this.request<
        {
          success?: boolean;
          data?: {
            policy_file?: string;
            exists?: boolean;
            policy_engine?: object;
            groups?: object;
          };
        },
        any
      >({
        path: `/policy`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Update policy_engine configuration while preserving or replacing named groups.
     *
     * @tags Network Policy
     * @name PolicyCreate
     * @summary Update policy document
     * @request POST:/policy
     * @secure
     */
    policyCreate: (data: object, params: RequestParams = {}) =>
      this.request<SuccessResponse, any>({
        path: `/policy`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),
  };
  policyValidate = {
    /**
     * @description Validate a policy payload without saving it to disk.
     *
     * @tags Network Policy
     * @name PolicyValidateCreate
     * @summary Validate policy payload
     * @request POST:/policy_validate
     * @secure
     */
    policyValidateCreate: (data: object, params: RequestParams = {}) =>
      this.request<
        {
          success?: boolean;
          data?: {
            valid?: boolean;
            normalized?: object;
            effective?: object;
          };
        },
        any
      >({
        path: `/policy_validate`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),
  };
  policyGroups = {
    /**
     * @description List named channel hash and pubkey groups.
     *
     * @tags Network Policy
     * @name PolicyGroupsList
     * @summary List policy groups
     * @request GET:/policy_groups
     * @secure
     */
    policyGroupsList: (
      query?: {
        /** Optional group kind filter. */
        kind?: "channel_hashes" | "pubkeys";
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          success?: boolean;
          data?: object;
        },
        any
      >({
        path: `/policy_groups`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Create a named group for channel hashes or pubkeys.
     *
     * @tags Network Policy
     * @name PolicyGroupsCreate
     * @summary Create policy group
     * @request POST:/policy_groups
     * @secure
     */
    policyGroupsCreate: (
      data: {
        kind: "channel_hashes" | "pubkeys";
        group_id?: string;
        friendly_name?: string;
        description?: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<SuccessResponse, any>({
        path: `/policy_groups`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * @description Delete a named group and all of its entries.
     *
     * @tags Network Policy
     * @name PolicyGroupsDelete
     * @summary Delete policy group
     * @request DELETE:/policy_groups
     * @secure
     */
    policyGroupsDelete: (
      data: {
        kind: "channel_hashes" | "pubkeys";
        group_id: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<SuccessResponse, any>({
        path: `/policy_groups`,
        method: "DELETE",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),
  };
  policyGroupEntries = {
    /**
     * @description Return entries for a specific named channel hash/pubkey group.
     *
     * @tags Network Policy
     * @name PolicyGroupEntriesList
     * @summary List group entries
     * @request GET:/policy_group_entries
     * @secure
     */
    policyGroupEntriesList: (
      query: {
        kind: "channel_hashes" | "pubkeys";
        group_id: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          success?: boolean;
          data?: object;
        },
        any
      >({
        path: `/policy_group_entries`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Add a friendly-named entry to a policy group.
     *
     * @tags Network Policy
     * @name PolicyGroupEntriesCreate
     * @summary Add group entry
     * @request POST:/policy_group_entries
     * @secure
     */
    policyGroupEntriesCreate: (
      data: {
        kind: "channel_hashes" | "pubkeys";
        group_id: string;
        value: string;
        entry_id?: string;
        friendly_name?: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<SuccessResponse, any>({
        path: `/policy_group_entries`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * @description Remove an entry by entry_id or value from a policy group.
     *
     * @tags Network Policy
     * @name PolicyGroupEntriesDelete
     * @summary Remove group entry
     * @request DELETE:/policy_group_entries
     * @secure
     */
    policyGroupEntriesDelete: (
      data: {
        kind: "channel_hashes" | "pubkeys";
        group_id: string;
        entry_id?: string;
        value?: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<SuccessResponse, any>({
        path: `/policy_group_entries`,
        method: "DELETE",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),
  };
  createIdentity = {
    /**
     * @description Create a new companion or room server identity. `name` must be non-empty after trimming leading/trailing whitespace (whitespace-only values are rejected).
     *
     * @tags Identities
     * @name CreateIdentityCreate
     * @summary Create new identity
     * @request POST:/create_identity
     */
    createIdentityCreate: (
      data: {
        /**
         * Identity registration name (alphanumeric, spaces, hyphens, underscores).
         * Trimmed; must not be empty or whitespace-only.
         * @minLength 1
         * @maxLength 64
         * @pattern ^[a-zA-Z0-9_\-\s]+$
         * @example "General Chat"
         */
        name: string;
        /**
         * 32- or 64-byte hex key (64 or 128 chars). Omit for auto-generation
         * @pattern ^(?:[0-9a-fA-F]{64}|[0-9a-fA-F]{128})$
         * @example "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
         */
        identity_key?: string;
        /**
         * - companion: Companion identity with a TCP endpoint
         * - room_server: Room server for group chat
         * @example "room_server"
         */
        type: "companion" | "room_server";
        /** Type-specific settings */
        settings?: {
          /**
           * Admin authentication password (room_server only)
           * @minLength 4
           * @example "admin123"
           */
          admin_password?: string;
          /**
           * Guest authentication password (room_server only)
           * @minLength 4
           * @example "guest123"
           */
          guest_password?: string;
          /**
           * Maximum messages to keep (hard limit 32)
           * @min 1
           * @max 32
           * @default 32
           * @example 32
           */
          max_posts?: number;
          /**
           * Advertised node name (companion only; defaults to identity name)
           * @example "My Companion"
           */
          node_name?: string;
          /**
           * TCP listener port (companion only)
           * @min 1
           * @max 65535
           * @default 5000
           * @example 5000
           */
          tcp_port?: number;
          /**
           * TCP listener bind address (companion only)
           * @default "0.0.0.0"
           * @example "0.0.0.0"
           */
          bind_address?: string;
        };
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          success?: boolean;
          data?: {
            name?: string;
            type?: string;
            hash?: string;
            public_key?: string;
          };
        },
        ErrorResponse
      >({
        path: `/create_identity`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),
  };
  identities = {
    /**
     * @description Returns configured room servers and companions plus runtime registration info. Companion entries with missing or blank registration names are assigned a stable `companion_<pubkeyPrefix>` name derived from the identity key and persisted when possible.
     *
     * @tags Identities
     * @name IdentitiesList
     * @summary List all identities
     * @request GET:/identities
     */
    identitiesList: (params: RequestParams = {}) =>
      this.request<
        {
          success?: boolean;
          data?: {
            identities?: Identity[];
          };
        },
        any
      >({
        path: `/identities`,
        method: "GET",
        format: "json",
        ...params,
      }),
  };
  identity = {
    /**
     * @description Retrieve details of a specific identity by name
     *
     * @tags Identities
     * @name IdentityList
     * @summary Get specific identity
     * @request GET:/identity
     */
    identityList: (
      query: {
        /** Identity name to retrieve */
        name: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          success?: boolean;
          data?: Identity;
        },
        any
      >({
        path: `/identity`,
        method: "GET",
        query: query,
        format: "json",
        ...params,
      }),
  };
  updateIdentity = {
    /**
     * @description Modify an existing identity's configuration. For `room_server`, `name` is required to locate the identity. For `companion`, provide `name` OR `lookup_identity_key` OR `public_key_prefix` (at least 8 hex characters for prefix lookups) when the registration name is unknown.
     *
     * @tags Identities
     * @name UpdateIdentityUpdate
     * @summary Update identity
     * @request PUT:/update_identity
     * @secure
     */
    updateIdentityUpdate: (
      data: {
        /** @default "room_server" */
        type?: "room_server" | "companion";
        /** Current identity registration name (required for room_server; optional for companion if lookup fields are set) */
        name?: string;
        /**
         * Companion only: hex private identity key (full or unique prefix, min 8 hex chars)
         * to locate the companion when `name` is omitted.
         */
        lookup_identity_key?: string;
        /** Companion only: ed25519 public key hex prefix (min 8 hex chars) to locate the companion when `name` is omitted. */
        public_key_prefix?: string;
        /** New identity name (optional; must be non-empty if provided) */
        new_name?: string;
        /** New identity key (optional) */
        identity_key?: string;
        /** Updated settings */
        settings?: object;
      },
      params: RequestParams = {},
    ) =>
      this.request<SuccessResponse, any>({
        path: `/update_identity`,
        method: "PUT",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),
  };
  deleteIdentity = {
    /**
     * @description Remove an identity from the system. For `room_server`, `name` is required. For `companion`, provide `name` OR `lookup_identity_key` OR `public_key_prefix` (at least 8 hex characters for prefix lookups).
     *
     * @tags Identities
     * @name DeleteIdentityDelete
     * @summary Delete identity
     * @request DELETE:/delete_identity
     * @secure
     */
    deleteIdentityDelete: (
      query?: {
        /** Identity registration name to delete (required for room_server) */
        name?: string;
        /** Identity kind (default room_server) */
        type?: "room_server" | "companion";
        /** Companion only: hex identity key (full or unique prefix, min 8 hex chars) when `name` is omitted. */
        lookup_identity_key?: string;
        /** Companion only: public key hex prefix (min 8 hex chars) when `name` is omitted. */
        public_key_prefix?: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<SuccessResponse, any>({
        path: `/delete_identity`,
        method: "DELETE",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),
  };
  sendRoomServerAdvert = {
    /**
     * @description Broadcast a room server advertisement packet
     *
     * @tags Identities
     * @name SendRoomServerAdvertCreate
     * @summary Send room server advertisement
     * @request POST:/send_room_server_advert
     * @secure
     */
    sendRoomServerAdvertCreate: (
      data: {
        /** Room server identity name */
        name: string;
        /** Node name for the advertisement */
        node_name?: string;
        /**
         * GPS latitude
         * @format float
         * @example 0
         */
        latitude?: number;
        /**
         * GPS longitude
         * @format float
         * @example 0
         */
        longitude?: number;
        /**
         * Disable forwarding flag
         * @default false
         */
        disable_fwd?: boolean;
      },
      params: RequestParams = {},
    ) =>
      this.request<SuccessResponse, any>({
        path: `/send_room_server_advert`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),
  };
  aclInfo = {
    /**
     * @description Get ACL configuration and statistics for all registered identities. Returns information including: - Identity name, type, and hash - Max clients allowed - Number of authenticated clients - Password configuration status - Read-only access setting
     *
     * @tags ACL
     * @name AclInfoList
     * @summary Get ACL information for all identities
     * @request GET:/acl_info
     */
    aclInfoList: (params: RequestParams = {}) =>
      this.request<
        {
          success?: boolean;
          data?: {
            acls?: {
              /** @example "repeater" */
              name?: string;
              /** @example "repeater" */
              type?: "repeater" | "room_server";
              /**
               * @pattern ^0x[0-9a-fA-F]{2}$
               * @example "0x42"
               */
              hash?: string;
              /** @example 100 */
              max_clients?: number;
              /** @example 5 */
              authenticated_clients?: number;
              /** @example true */
              has_admin_password?: boolean;
              /** @example true */
              has_guest_password?: boolean;
              /** @example true */
              allow_read_only?: boolean;
            }[];
            /** @example 3 */
            total_identities?: number;
            /** @example 15 */
            total_authenticated_clients?: number;
          };
        },
        any
      >({
        path: `/acl_info`,
        method: "GET",
        format: "json",
        ...params,
      }),
  };
  aclClients = {
    /**
     * @description Get list of authenticated clients in access control list for an identity
     *
     * @tags ACL
     * @name AclClientsList
     * @summary List ACL clients
     * @request GET:/acl_clients
     */
    aclClientsList: (
      query?: {
        /**
         * Identity hash
         * @pattern ^0x[0-9a-fA-F]{2}$
         * @example "0x42"
         */
        identity_hash?: string;
        /**
         * Identity name
         * @example "General"
         */
        identity_name?: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          success?: boolean;
          data?: {
            clients?: ACLClient[];
            /** Number of clients returned */
            count?: number;
            /** Filter applied (if any) */
            filter?: string | null;
          };
        },
        any
      >({
        path: `/acl_clients`,
        method: "GET",
        query: query,
        format: "json",
        ...params,
      }),
  };
  aclRemoveClient = {
    /**
     * @description Remove a client from the access control list
     *
     * @tags ACL
     * @name AclRemoveClientCreate
     * @summary Remove client from ACL
     * @request POST:/acl_remove_client
     */
    aclRemoveClientCreate: (
      data: {
        /**
         * Identity hash
         * @pattern ^0x[0-9a-fA-F]{2}$
         * @example "0x42"
         */
        identity_hash: string;
        /**
         * Identity name (alternative to hash)
         * @example "General"
         */
        identity_name?: string;
        /**
         * Client public key to remove
         * @pattern ^[0-9a-fA-F]{64}$
         * @example "abc123def456..."
         */
        client_pubkey: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<SuccessResponse, any>({
        path: `/acl_remove_client`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),
  };
  aclStats = {
    /**
     * @description Get statistics about access control lists
     *
     * @tags ACL
     * @name AclStatsList
     * @summary Get ACL statistics
     * @request GET:/acl_stats
     */
    aclStatsList: (params: RequestParams = {}) =>
      this.request<
        {
          success?: boolean;
          data?: {
            total_entries?: number;
            by_identity?: object;
          };
        },
        any
      >({
        path: `/acl_stats`,
        method: "GET",
        format: "json",
        ...params,
      }),
  };
  roomMessages = {
    /**
     * @description Retrieve messages from a room with pagination. **Max Messages Per Room**: 32 (hard limit) - Older messages auto-deleted every 10 minutes - Cannot be increased beyond 32
     *
     * @tags Room Server
     * @name RoomMessagesList
     * @summary Get room messages
     * @request GET:/room_messages
     */
    roomMessagesList: (
      query?: {
        /**
         * Name of the room (use this OR room_hash)
         * @example "General"
         */
        room_name?: string;
        /**
         * Hash of room identity (use this OR room_name)
         * @pattern ^0x[0-9a-fA-F]{2}$
         * @example "0x42"
         */
        room_hash?: string;
        /**
         * Max messages to return
         * @min 1
         * @max 100
         * @default 50
         * @example 50
         */
        limit?: number;
        /**
         * Skip first N messages (for pagination)
         * @min 0
         * @default 0
         * @example 0
         */
        offset?: number;
        /**
         * Only return messages after this Unix timestamp
         * @format float
         * @example 1734567890.5
         */
        since_timestamp?: number;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          success?: boolean;
          data?: {
            room_name?: string;
            room_hash?: string;
            messages?: RoomMessage[];
            /** Number of messages in this response */
            count?: number;
            /** Total messages in room (max 32) */
            total?: number;
            limit?: number;
            offset?: number;
          };
        },
        ErrorResponse
      >({
        path: `/room_messages`,
        method: "GET",
        query: query,
        format: "json",
        ...params,
      }),
  };
  roomPostMessage = {
    /**
     * @description Add a new message to a room server. Message will be distributed to all synced clients. **Special author values:** - `"server"` or `"system"` - System message, goes to ALL clients (API only) - Any hex string - Normal message, NOT sent to that client **Security:** - Radio messages cannot use server key (blocked) - API messages can use server key (for announcements) **Rate Limits:** - 10 messages/minute per author_pubkey - 160 bytes max message length - Global 1.1s gap between transmissions
     *
     * @tags Room Server
     * @name RoomPostMessageCreate
     * @summary Post message to room
     * @request POST:/room_post_message
     */
    roomPostMessageCreate: (
      data: {
        /**
         * Name of the room (use this OR room_hash)
         * @example "General"
         */
        room_name?: string;
        /**
         * Hash of room identity (use this OR room_name)
         * @pattern ^0x[0-9a-fA-F]{2}$
         * @example "0x42"
         */
        room_hash?: string;
        /**
         * Message text (auto-truncated at 160 bytes)
         * @minLength 1
         * @maxLength 160
         * @example "Hello from API"
         */
        message: string;
        /**
         * Author's public key as hex string (64 chars), or special values:
         * - "server" = system message (all clients receive)
         * - "system" = alias for "server"
         * - hex string = normal message (author won't receive)
         * @example "abc123def456..."
         */
        author_pubkey: string;
        /**
         * Message type:
         * - 0: Plain text
         * - 2: Signed plain text
         * @default 0
         * @example 0
         */
        txt_type?: 0 | 2;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          success?: boolean;
          data?: {
            /** Database ID of created message */
            message_id?: number;
            room_name?: string;
            room_hash?: string;
            /** Always true - distribution is async */
            queued_for_distribution?: boolean;
            /** True if author_pubkey was "server" */
            is_server_message?: boolean;
            /** Explains message distribution behavior */
            author_filter_note?: string;
          };
        },
        ErrorResponse
      >({
        path: `/room_post_message`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),
  };
  roomStats = {
    /**
     * @description Get detailed statistics for one or all room servers. **Room Limits:** - 32 messages maximum per room (hard limit) - Messages auto-expire every 10 minutes - Author filtering: messages not sent back to author
     *
     * @tags Room Server
     * @name RoomStatsList
     * @summary Get room statistics
     * @request GET:/room_stats
     */
    roomStatsList: (
      query?: {
        /**
         * Get stats for specific room (omit for all rooms)
         * @example "General"
         */
        room_name?: string;
        /**
         * Get stats by room hash (use this OR room_name)
         * @pattern ^0x[0-9a-fA-F]{2}$
         * @example "0x42"
         */
        room_hash?: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          success?: boolean;
          data?: {
            room_name?: string;
            room_hash?: string;
            /**
             * Current message count (max 32)
             * @min 0
             * @max 32
             * @example 15
             */
            total_messages?: number;
            /**
             * Total clients that have synced
             * @min 0
             * @example 8
             */
            total_clients?: number;
            /**
             * Clients active within timeout window
             * @min 0
             * @example 3
             */
            active_clients?: number;
            /**
             * Message limit setting (always 32)
             * @min 1
             * @max 32
             * @example 32
             */
            max_posts?: number;
            /**
             * Distribution task is active
             * @example true
             */
            sync_running?: boolean;
            /** List of all clients with sync status */
            clients?: RoomClient[];
          };
        },
        ErrorResponse
      >({
        path: `/room_stats`,
        method: "GET",
        query: query,
        format: "json",
        ...params,
      }),
  };
  roomClients = {
    /**
     * @description List all clients synced to a room with their status. **Client Filtering:** - Clients only receive messages where author_pubkey ≠ client_pubkey - unsynced_count shows pending messages for each client - is_active indicates client synced within timeout window
     *
     * @tags Room Server
     * @name RoomClientsList
     * @summary Get room clients
     * @request GET:/room_clients
     */
    roomClientsList: (
      query?: {
        /**
         * Room name
         * @example "General"
         */
        room_name?: string;
        /**
         * Room hash (use this OR room_name)
         * @pattern ^0x[0-9a-fA-F]{2}$
         * @example "0x42"
         */
        room_hash?: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          success?: boolean;
          data?: {
            room_name?: string;
            room_hash?: string;
            clients?: RoomClient[];
          };
        },
        ErrorResponse
      >({
        path: `/room_clients`,
        method: "GET",
        query: query,
        format: "json",
        ...params,
      }),
  };
  roomMessage = {
    /**
     * No description
     *
     * @tags Room Server
     * @name RoomMessageDelete
     * @summary Delete specific message
     * @request DELETE:/room_message
     */
    roomMessageDelete: (
      query: {
        room_name?: string;
        room_hash?: string;
        message_id: number;
      },
      params: RequestParams = {},
    ) =>
      this.request<void, any>({
        path: `/room_message`,
        method: "DELETE",
        query: query,
        ...params,
      }),
  };
  roomMessagesClear = {
    /**
     * @description ⚠️ Destructive operation - cannot be undone!
     *
     * @tags Room Server
     * @name RoomMessagesClearDelete
     * @summary Clear all room messages
     * @request DELETE:/room_messages_clear
     */
    roomMessagesClearDelete: (
      query?: {
        room_name?: string;
        room_hash?: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          success?: boolean;
          data?: {
            deleted_count?: number;
          };
        },
        any
      >({
        path: `/room_messages_clear`,
        method: "DELETE",
        query: query,
        format: "json",
        ...params,
      }),
  };
  needsSetup = {
    /**
     * No description
     *
     * @tags System
     * @name NeedsSetupList
     * @summary Check setup wizard status
     * @request GET:/needs_setup
     */
    needsSetupList: (params: RequestParams = {}) =>
      this.request<object, any>({
        path: `/needs_setup`,
        method: "GET",
        format: "json",
        ...params,
      }),
  };
  siteInfo = {
    /**
     * No description
     *
     * @tags System
     * @name SiteInfoList
     * @summary Get site and host info
     * @request GET:/site_info
     */
    siteInfoList: (params: RequestParams = {}) =>
      this.request<object, any>({
        path: `/site_info`,
        method: "GET",
        format: "json",
        ...params,
      }),
  };
  hardwareOptions = {
    /**
     * No description
     *
     * @tags System
     * @name HardwareOptionsList
     * @summary Get supported hardware options
     * @request GET:/hardware_options
     */
    hardwareOptionsList: (params: RequestParams = {}) =>
      this.request<object, any>({
        path: `/hardware_options`,
        method: "GET",
        format: "json",
        ...params,
      }),
  };
  radioPresets = {
    /**
     * No description
     *
     * @tags System
     * @name RadioPresetsList
     * @summary Get radio presets
     * @request GET:/radio_presets
     */
    radioPresetsList: (params: RequestParams = {}) =>
      this.request<object, any>({
        path: `/radio_presets`,
        method: "GET",
        format: "json",
        ...params,
      }),
  };
  serialPorts = {
    /**
     * No description
     *
     * @tags System
     * @name SerialPortsList
     * @summary List available serial ports
     * @request GET:/serial_ports
     */
    serialPortsList: (params: RequestParams = {}) =>
      this.request<object, any>({
        path: `/serial_ports`,
        method: "GET",
        format: "json",
        ...params,
      }),
  };
  setupWizard = {
    /**
     * No description
     *
     * @tags System
     * @name SetupWizardCreate
     * @summary Submit setup wizard payload
     * @request POST:/setup_wizard
     */
    setupWizardCreate: (data: object, params: RequestParams = {}) =>
      this.request<object, any>({
        path: `/setup_wizard`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),
  };
  checkPymcConsole = {
    /**
     * No description
     *
     * @tags System
     * @name CheckPymcConsoleList
     * @summary Check pyMC console availability
     * @request GET:/check_pymc_console
     */
    checkPymcConsoleList: (params: RequestParams = {}) =>
      this.request<object, any>({
        path: `/check_pymc_console`,
        method: "GET",
        format: "json",
        ...params,
      }),
  };
  mqttStatus = {
    /**
     * No description
     *
     * @tags System
     * @name MqttStatusList
     * @summary Get MQTT runtime status
     * @request GET:/mqtt_status
     */
    mqttStatusList: (params: RequestParams = {}) =>
      this.request<object, any>({
        path: `/mqtt_status`,
        method: "GET",
        format: "json",
        ...params,
      }),
  };
  brokerPresets = {
    /**
     * No description
     *
     * @tags System
     * @name BrokerPresetsList
     * @summary List MQTT broker presets
     * @request GET:/broker_presets
     */
    brokerPresetsList: (params: RequestParams = {}) =>
      this.request<object, any>({
        path: `/broker_presets`,
        method: "GET",
        format: "json",
        ...params,
      }),
  };
  updateWebConfig = {
    /**
     * No description
     *
     * @tags System
     * @name UpdateWebConfigCreate
     * @summary Update web configuration
     * @request POST:/update_web_config
     * @secure
     */
    updateWebConfigCreate: (data: object, params: RequestParams = {}) =>
      this.request<SuccessResponse, any>({
        path: `/update_web_config`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),
  };
  updateMqttConfig = {
    /**
     * No description
     *
     * @tags System
     * @name UpdateMqttConfigCreate
     * @summary Update MQTT configuration
     * @request POST:/update_mqtt_config
     * @secure
     */
    updateMqttConfigCreate: (data: object, params: RequestParams = {}) =>
      this.request<SuccessResponse, any>({
        path: `/update_mqtt_config`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),
  };
  updateAdvertRateLimitConfig = {
    /**
     * No description
     *
     * @tags Adverts
     * @name UpdateAdvertRateLimitConfigCreate
     * @summary Update advert rate limit configuration
     * @request POST:/update_advert_rate_limit_config
     * @secure
     */
    updateAdvertRateLimitConfigCreate: (
      data: object,
      params: RequestParams = {},
    ) =>
      this.request<SuccessResponse, any>({
        path: `/update_advert_rate_limit_config`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),
  };
  bulkPackets = {
    /**
     * No description
     *
     * @tags Packets
     * @name BulkPacketsList
     * @summary Fetch packets in bulk
     * @request GET:/bulk_packets
     */
    bulkPacketsList: (
      query?: {
        /** @default 1000 */
        limit?: number;
        /** @default 0 */
        offset?: number;
        start_timestamp?: number;
        end_timestamp?: number;
      },
      params: RequestParams = {},
    ) =>
      this.request<object, any>({
        path: `/bulk_packets`,
        method: "GET",
        query: query,
        format: "json",
        ...params,
      }),
  };
  airtimeData = {
    /**
     * No description
     *
     * @tags Packets
     * @name AirtimeDataList
     * @summary Get lightweight airtime packet rows
     * @request GET:/airtime_data
     */
    airtimeDataList: (
      query?: {
        start_timestamp?: number;
        end_timestamp?: number;
        /** @default 50000 */
        limit?: number;
      },
      params: RequestParams = {},
    ) =>
      this.request<object, any>({
        path: `/airtime_data`,
        method: "GET",
        query: query,
        format: "json",
        ...params,
      }),
  };
  airtimeChartData = {
    /**
     * No description
     *
     * @tags Charts
     * @name AirtimeChartDataList
     * @summary Get server-aggregated airtime chart buckets
     * @request GET:/airtime_chart_data
     */
    airtimeChartDataList: (
      query?: {
        start_timestamp?: number;
        end_timestamp?: number;
        /** @default 60 */
        bucket_seconds?: number;
        /** @default 9 */
        sf?: number;
        /** @default 62500 */
        bw_hz?: number;
        /** @default 5 */
        cr?: number;
        /** @default 17 */
        preamble?: number;
      },
      params: RequestParams = {},
    ) =>
      this.request<object, any>({
        path: `/airtime_chart_data`,
        method: "GET",
        query: query,
        format: "json",
        ...params,
      }),
  };
  advertsCountByContactType = {
    /**
     * No description
     *
     * @tags Adverts
     * @name AdvertsCountByContactTypeList
     * @summary Get advert count for contact type
     * @request GET:/adverts_count_by_contact_type
     */
    advertsCountByContactTypeList: (
      query: {
        contact_type: string;
        hours?: number;
      },
      params: RequestParams = {},
    ) =>
      this.request<object, any>({
        path: `/adverts_count_by_contact_type`,
        method: "GET",
        query: query,
        format: "json",
        ...params,
      }),
  };
  advertRateLimitStats = {
    /**
     * No description
     *
     * @tags Adverts
     * @name AdvertRateLimitStatsList
     * @summary Get advert rate-limit runtime stats
     * @request GET:/advert_rate_limit_stats
     */
    advertRateLimitStatsList: (params: RequestParams = {}) =>
      this.request<object, any>({
        path: `/advert_rate_limit_stats`,
        method: "GET",
        format: "json",
        ...params,
      }),
  };
  crcErrorCount = {
    /**
     * No description
     *
     * @tags System
     * @name CrcErrorCountList
     * @summary Get CRC error count
     * @request GET:/crc_error_count
     */
    crcErrorCountList: (
      query?: {
        /** @default 24 */
        hours?: number;
      },
      params: RequestParams = {},
    ) =>
      this.request<object, any>({
        path: `/crc_error_count`,
        method: "GET",
        query: query,
        format: "json",
        ...params,
      }),
  };
  crcErrorHistory = {
    /**
     * No description
     *
     * @tags System
     * @name CrcErrorHistoryList
     * @summary Get CRC error history
     * @request GET:/crc_error_history
     */
    crcErrorHistoryList: (
      query?: {
        /** @default 24 */
        hours?: number;
        limit?: number;
      },
      params: RequestParams = {},
    ) =>
      this.request<object, any>({
        path: `/crc_error_history`,
        method: "GET",
        query: query,
        format: "json",
        ...params,
      }),
  };
  memoryDebug = {
    /**
     * No description
     *
     * @tags System
     * @name MemoryDebugList
     * @summary Get memory diagnostics
     * @request GET:/memory_debug
     */
    memoryDebugList: (params: RequestParams = {}) =>
      this.request<object, any>({
        path: `/memory_debug`,
        method: "GET",
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags System
     * @name MemoryDebugCreate
     * @summary Start/stop memory diagnostics tracing
     * @request POST:/memory_debug
     */
    memoryDebugCreate: (
      data: {
        action?: "start" | "stop";
      },
      params: RequestParams = {},
    ) =>
      this.request<object, any>({
        path: `/memory_debug`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),
  };
  configExport = {
    /**
     * No description
     *
     * @tags System
     * @name ConfigExportList
     * @summary Export configuration
     * @request GET:/config_export
     */
    configExportList: (
      query?: {
        include_secrets?: boolean;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          success: boolean;
          data: {
            meta: {
              /** @format date-time */
              exported_at: string;
              version: string;
              config_path: string;
              includes_secrets: boolean;
            };
            config: object;
          };
          error?: string;
        },
        any
      >({
        path: `/config_export`,
        method: "GET",
        query: query,
        format: "json",
        ...params,
      }),
  };
  configImport = {
    /**
     * No description
     *
     * @tags System
     * @name ConfigImportCreate
     * @summary Import configuration
     * @request POST:/config_import
     */
    configImportCreate: (data: object, params: RequestParams = {}) =>
      this.request<object, any>({
        path: `/config_import`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),
  };
  identityExport = {
    /**
     * No description
     *
     * @tags Identities
     * @name IdentityExportList
     * @summary Export repeater identity key
     * @request GET:/identity_export
     */
    identityExportList: (params: RequestParams = {}) =>
      this.request<
        {
          success: boolean;
          data: {
            identity_key_hex: string;
            key_length_bytes: number;
            public_key_hex?: string;
            node_address?: string;
          };
          error?: string;
        },
        any
      >({
        path: `/identity_export`,
        method: "GET",
        format: "json",
        ...params,
      }),
  };
  generateVanityKey = {
    /**
     * No description
     *
     * @tags Identities
     * @name GenerateVanityKeyCreate
     * @summary Generate vanity identity key
     * @request POST:/generate_vanity_key
     */
    generateVanityKeyCreate: (
      data: {
        /**
         * @minLength 1
         * @maxLength 8
         */
        prefix: string;
        apply?: boolean;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          success: boolean;
          data: {
            public_hex: string;
            private_hex: string;
            attempts: number;
            applied?: boolean;
          };
          error?: string;
        },
        any
      >({
        path: `/generate_vanity_key`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),
  };
  dbStats = {
    /**
     * No description
     *
     * @tags System
     * @name DbStatsList
     * @summary Get database statistics
     * @request GET:/db_stats
     */
    dbStatsList: (params: RequestParams = {}) =>
      this.request<
        {
          success: boolean;
          data: {
            database_size_bytes: number;
            rrd_size_bytes: number;
            tables: {
              name: string;
              row_count: number;
              oldest_timestamp?: number;
              newest_timestamp?: number;
              has_timestamp: boolean;
            }[];
          };
          error?: string;
        },
        any
      >({
        path: `/db_stats`,
        method: "GET",
        format: "json",
        ...params,
      }),
  };
  dbPurge = {
    /**
     * No description
     *
     * @tags System
     * @name DbPurgeCreate
     * @summary Purge database tables
     * @request POST:/db_purge
     */
    dbPurgeCreate: (data: object, params: RequestParams = {}) =>
      this.request<
        {
          success: boolean;
          data: Record<
            string,
            {
              deleted?: number;
              error?: string;
            }
          >;
          message: string;
          error?: string;
        },
        any
      >({
        path: `/db_purge`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),
  };
  dbVacuum = {
    /**
     * No description
     *
     * @tags System
     * @name DbVacuumCreate
     * @summary Vacuum SQLite database
     * @request POST:/db_vacuum
     */
    dbVacuumCreate: (params: RequestParams = {}) =>
      this.request<
        {
          success: boolean;
          data: {
            size_before: number;
            size_after: number;
            freed_bytes: number;
          };
          error?: string;
        },
        any
      >({
        path: `/db_vacuum`,
        method: "POST",
        format: "json",
        ...params,
      }),
  };
  docs = {
    /**
     * No description
     *
     * @tags System
     * @name DocsList
     * @summary Serve Swagger UI docs page
     * @request GET:/docs
     */
    docsList: (params: RequestParams = {}) =>
      this.request<void, any>({
        path: `/docs`,
        method: "GET",
        ...params,
      }),
  };
  api = {
    /**
     * No description
     *
     * @tags Authentication
     * @name AuthTokensList
     * @summary List API tokens (alias path)
     * @request GET:/api/auth/tokens
     */
    authTokensList: (params: RequestParams = {}) =>
      this.request<object, any>({
        path: `/api/auth/tokens`,
        method: "GET",
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Authentication
     * @name AuthTokensCreate
     * @summary Create API token (alias path)
     * @request POST:/api/auth/tokens
     */
    authTokensCreate: (data: object, params: RequestParams = {}) =>
      this.request<object, any>({
        path: `/api/auth/tokens`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Authentication
     * @name AuthTokensDelete
     * @summary Revoke API token (alias path)
     * @request DELETE:/api/auth/tokens/{token_id}
     */
    authTokensDelete: (tokenId: number, params: RequestParams = {}) =>
      this.request<object, any>({
        path: `/api/auth/tokens/${tokenId}`,
        method: "DELETE",
        format: "json",
        ...params,
      }),
  };
  companion = {
    /**
     * No description
     *
     * @tags System
     * @name CompanionList
     * @summary List companion bridge instances
     * @request GET:/companion
     */
    companionList: (params: RequestParams = {}) =>
      this.request<object, any>({
        path: `/companion`,
        method: "GET",
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags System
     * @name SelfInfoList
     * @summary Get local companion identity info
     * @request GET:/companion/self_info
     */
    selfInfoList: (params: RequestParams = {}) =>
      this.request<object, any>({
        path: `/companion/self_info`,
        method: "GET",
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags System
     * @name ContactsList
     * @summary List companion contacts
     * @request GET:/companion/contacts
     */
    contactsList: (params: RequestParams = {}) =>
      this.request<object, any>({
        path: `/companion/contacts`,
        method: "GET",
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags System
     * @name ContactList
     * @summary Get one companion contact
     * @request GET:/companion/contact
     */
    contactList: (
      query: {
        pub_key: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<object, any>({
        path: `/companion/contact`,
        method: "GET",
        query: query,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags System
     * @name ImportRepeaterContactsCreate
     * @summary Import repeater adverts into companion contacts
     * @request POST:/companion/import_repeater_contacts
     */
    importRepeaterContactsCreate: (data: object, params: RequestParams = {}) =>
      this.request<object, any>({
        path: `/companion/import_repeater_contacts`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags System
     * @name ChannelsList
     * @summary List companion channels
     * @request GET:/companion/channels
     */
    channelsList: (params: RequestParams = {}) =>
      this.request<object, any>({
        path: `/companion/channels`,
        method: "GET",
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags System
     * @name StatsList
     * @summary Get companion stats
     * @request GET:/companion/stats
     */
    statsList: (params: RequestParams = {}) =>
      this.request<object, any>({
        path: `/companion/stats`,
        method: "GET",
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags System
     * @name SendTextCreate
     * @summary Send direct text message via companion
     * @request POST:/companion/send_text
     */
    sendTextCreate: (data: object, params: RequestParams = {}) =>
      this.request<object, any>({
        path: `/companion/send_text`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags System
     * @name SendChannelMessageCreate
     * @summary Send channel message via companion
     * @request POST:/companion/send_channel_message
     */
    sendChannelMessageCreate: (data: object, params: RequestParams = {}) =>
      this.request<object, any>({
        path: `/companion/send_channel_message`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags System
     * @name LoginCreate
     * @summary Initiate companion login flow
     * @request POST:/companion/login
     */
    loginCreate: (data: object, params: RequestParams = {}) =>
      this.request<object, any>({
        path: `/companion/login`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags System
     * @name RequestStatusCreate
     * @summary Request companion status frame
     * @request POST:/companion/request_status
     */
    requestStatusCreate: (params: RequestParams = {}) =>
      this.request<object, any>({
        path: `/companion/request_status`,
        method: "POST",
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags System
     * @name RequestTelemetryCreate
     * @summary Request companion telemetry frame
     * @request POST:/companion/request_telemetry
     */
    requestTelemetryCreate: (params: RequestParams = {}) =>
      this.request<object, any>({
        path: `/companion/request_telemetry`,
        method: "POST",
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags System
     * @name SendCommandCreate
     * @summary Send command to companion
     * @request POST:/companion/send_command
     */
    sendCommandCreate: (data: object, params: RequestParams = {}) =>
      this.request<object, any>({
        path: `/companion/send_command`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags System
     * @name ResetPathCreate
     * @summary Reset companion route/path state
     * @request POST:/companion/reset_path
     */
    resetPathCreate: (params: RequestParams = {}) =>
      this.request<object, any>({
        path: `/companion/reset_path`,
        method: "POST",
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags System
     * @name SetAdvertNameCreate
     * @summary Set companion advert name
     * @request POST:/companion/set_advert_name
     */
    setAdvertNameCreate: (data: object, params: RequestParams = {}) =>
      this.request<object, any>({
        path: `/companion/set_advert_name`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags System
     * @name SetAdvertLocationCreate
     * @summary Set companion advert location
     * @request POST:/companion/set_advert_location
     */
    setAdvertLocationCreate: (data: object, params: RequestParams = {}) =>
      this.request<object, any>({
        path: `/companion/set_advert_location`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags System
     * @name EventsList
     * @summary Stream companion events (SSE)
     * @request GET:/companion/events
     */
    eventsList: (params: RequestParams = {}) =>
      this.request<void, any>({
        path: `/companion/events`,
        method: "GET",
        ...params,
      }),
  };
  update = {
    /**
     * No description
     *
     * @tags System
     * @name StatusList
     * @summary Get update service status
     * @request GET:/update/status
     */
    statusList: (params: RequestParams = {}) =>
      this.request<object, any>({
        path: `/update/status`,
        method: "GET",
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags System
     * @name CheckList
     * @summary Trigger or fetch update check
     * @request GET:/update/check
     */
    checkList: (params: RequestParams = {}) =>
      this.request<object, any>({
        path: `/update/check`,
        method: "GET",
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags System
     * @name CheckCreate
     * @summary Trigger update check
     * @request POST:/update/check
     */
    checkCreate: (data?: object, params: RequestParams = {}) =>
      this.request<object, any>({
        path: `/update/check`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags System
     * @name InstallCreate
     * @summary Install available update
     * @request POST:/update/install
     */
    installCreate: (data?: object, params: RequestParams = {}) =>
      this.request<object, any>({
        path: `/update/install`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags System
     * @name ProgressList
     * @summary Stream update progress (SSE)
     * @request GET:/update/progress
     */
    progressList: (params: RequestParams = {}) =>
      this.request<void, any>({
        path: `/update/progress`,
        method: "GET",
        ...params,
      }),

    /**
     * No description
     *
     * @tags System
     * @name ChannelsList
     * @summary List update channels
     * @request GET:/update/channels
     */
    channelsList: (params: RequestParams = {}) =>
      this.request<object, any>({
        path: `/update/channels`,
        method: "GET",
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags System
     * @name SetChannelCreate
     * @summary Set update channel
     * @request POST:/update/set_channel
     */
    setChannelCreate: (data: object, params: RequestParams = {}) =>
      this.request<object, any>({
        path: `/update/set_channel`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags System
     * @name ChangelogList
     * @summary Get update changelog
     * @request GET:/update/changelog
     */
    changelogList: (params: RequestParams = {}) =>
      this.request<object, any>({
        path: `/update/changelog`,
        method: "GET",
        format: "json",
        ...params,
      }),
  };
  cli = {
    /**
     * No description
     *
     * @tags System
     * @name PostCli
     * @summary Execute repeater CLI command
     * @request POST:/cli
     * @secure
     */
    postCli: (
      data: {
        command: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<object, any>({
        path: `/cli`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),
  };
}
