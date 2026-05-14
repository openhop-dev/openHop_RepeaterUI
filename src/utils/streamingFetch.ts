import ApiService from './api';
import type { ApiResponse } from './api';

export type FetchPhase = 'connecting' | 'receiving';

export interface StreamingGetOptions {
  /** ms before aborting if no first byte arrives. Default: 15 000 */
  connectTimeoutMs?: number;
  /** ms of inactivity after streaming starts before aborting. Default: 5 000 */
  idleTimeoutMs?: number;
  /** fired immediately (connecting), then again when first byte arrives (receiving) */
  onPhaseChange?: (phase: FetchPhase) => void;
}

/**
 * Timeout-aware GET that never aborts an actively-streaming response.
 *
 * Two-phase timeout logic:
 *  1. Connect phase — if no bytes arrive within `connectTimeoutMs` → abort.
 *  2. Stream phase  — once bytes start flowing, arm a rolling idle timer reset
 *     on every progress event. Only fires if data stops for `idleTimeoutMs`.
 *
 * On a marginal mesh link a large query can take minutes to stream, but each
 * TCP chunk resets the idle timer, so we never abort mid-transfer.
 */
export async function streamingGet<T>(
  endpoint: string,
  params?: Record<string, unknown>,
  options: StreamingGetOptions = {},
): Promise<ApiResponse<T>> {
  const { connectTimeoutMs = 15_000, idleTimeoutMs = 5_000, onPhaseChange } = options;

  const controller = new AbortController();
  let streamStarted = false;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  const connectTimer = setTimeout(() => {
    if (!streamStarted) controller.abort(new Error('Connection timeout'));
  }, connectTimeoutMs);

  const resetIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      controller.abort(new Error('Stream stalled'));
    }, idleTimeoutMs);
  };

  onPhaseChange?.('connecting');

  try {
    return await ApiService.get<T>(endpoint, params, {
      signal: controller.signal,
      timeout: 0, // Disable axios instance timeout; AbortController handles timeouts
      onDownloadProgress: (event) => {
        if (!streamStarted && (event.loaded ?? 0) > 0) {
          streamStarted = true;
          clearTimeout(connectTimer);
          onPhaseChange?.('receiving');
          resetIdleTimer();
        } else if (streamStarted) {
          resetIdleTimer();
        }
      },
    });
  } finally {
    clearTimeout(connectTimer);
    if (idleTimer) clearTimeout(idleTimer);
  }
}
