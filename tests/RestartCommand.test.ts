import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Terminal } from '@xterm/xterm';
import { RestartCommand } from '@/commands/RestartCommand';

vi.mock('@/utils/api', () => ({
  default: {
    post: vi.fn(),
  },
}));

// Non-zero POLL_INTERVAL_MS is required: the while loop condition is
//   elapsed < (MAX_ATTEMPTS * POLL_INTERVAL_MS) / 1000
// With 0ms the loop body never runs (maxWaitTime === 0).
vi.mock('@/utils/constants', () => ({
  RESTART_POLL_ENDPOINT: '/api/needs_setup',
  RESTART_INITIAL_DELAY_MS: 0,
  RESTART_POLL_INTERVAL_MS: 100,
  RESTART_MAX_ATTEMPTS: 5,
  RESTART_STABLE_REQUIRED: 2,
}));

import ApiService from '@/utils/api';

function makeTerm() {
  const lines: string[] = [];
  const mock = {
    lines,
    write: vi.fn((s: string) => { lines.push(s); return 0; }),
    writeln: vi.fn((s: string) => { lines.push(s + '\n'); return 0; }),
  };
  return mock as unknown as Terminal & { lines: string[] };
}

function lines(term: Terminal) {
  return (term as unknown as { lines: string[] }).lines.join('');
}

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
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('RestartCommand', () => {
  const cmd = new RestartCommand();

  it('matches "restart" and "reboot"', () => {
    expect(cmd.matches('restart')).toBe(true);
    expect(cmd.matches('reboot')).toBe(true);
    expect(cmd.matches('Restart')).toBe(true);
    expect(cmd.matches('other')).toBe(false);
  });

  describe('success response → polls until stable', () => {
    it('calls writePrompt after reaching STABLE_REQUIRED consecutive 200s', async () => {
      vi.mocked(ApiService.post).mockResolvedValue({ success: true, message: 'ok' });

      let fetchCall = 0;
      vi.mocked(fetch).mockImplementation(() => {
        fetchCall++;
        // fail(1), ok(2), ok(3) → needs exactly 3 calls to reach STABLE_REQUIRED=2
        // If stableCount check is removed and any ok triggers success, only 2 calls happen
        return fetchCall === 1 ? failFetch() : okFetch();
      });

      const term = makeTerm();
      const writePrompt = vi.fn();

      const execPromise = cmd.execute({ term, writePrompt, args: [] });
      await vi.runAllTimersAsync();
      await execPromise;

      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3);
      expect(writePrompt).toHaveBeenCalled();
      expect(lines(term)).toContain('back online');
    });
  });

  describe('polkit / sudo failure (HTTP 200, success: false)', () => {
    it('shows error and does not poll', async () => {
      vi.mocked(ApiService.post).mockResolvedValue({
        success: false,
        error: 'Permission denied: polkit refused the request',
      });

      const term = makeTerm();
      const writePrompt = vi.fn();

      const execPromise = cmd.execute({ term, writePrompt, args: [] });
      await vi.runAllTimersAsync();
      await execPromise;

      expect(fetch).not.toHaveBeenCalled();
      expect(lines(term)).toContain('Permission denied');
      expect(writePrompt).toHaveBeenCalled();
    });
  });

  describe('HTTP 502 (vite proxy: backend unreachable)', () => {
    it('shows failure and does not poll', async () => {
      vi.mocked(ApiService.post).mockRejectedValue(
        Object.assign(new Error('Request failed with status code 502'), {
          response: { status: 502 },
        }),
      );

      const term = makeTerm();
      const writePrompt = vi.fn();

      const execPromise = cmd.execute({ term, writePrompt, args: [] });
      await vi.runAllTimersAsync();
      await execPromise;

      expect(fetch).not.toHaveBeenCalled();
      expect(lines(term)).toContain('failed');
    });
  });

  describe('HTTP 403 (permission denied at HTTP level)', () => {
    it('shows polkit hint and does not poll', async () => {
      vi.mocked(ApiService.post).mockRejectedValue(
        Object.assign(new Error('Forbidden'), {
          response: { status: 403 },
        }),
      );

      const term = makeTerm();
      const writePrompt = vi.fn();

      const execPromise = cmd.execute({ term, writePrompt, args: [] });
      await vi.runAllTimersAsync();
      await execPromise;

      expect(fetch).not.toHaveBeenCalled();
      expect(lines(term)).toContain('Permission denied');
    });
  });

  describe('ECONNRESET (service dropped connection mid-response)', () => {
    it('polls after network drop', async () => {
      vi.mocked(ApiService.post).mockRejectedValue(
        Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }),
      );
      vi.mocked(fetch).mockImplementation(okFetch);

      const term = makeTerm();
      const writePrompt = vi.fn();

      const execPromise = cmd.execute({ term, writePrompt, args: [] });
      await vi.runAllTimersAsync();
      await execPromise;

      expect(fetch).toHaveBeenCalled();
      expect(writePrompt).toHaveBeenCalled();
    });
  });

  describe('timeout (ECONNABORTED)', () => {
    it('polls after timeout', async () => {
      vi.mocked(ApiService.post).mockRejectedValue(
        Object.assign(new Error('timeout of 10000ms exceeded'), { code: 'ECONNABORTED' }),
      );
      vi.mocked(fetch).mockImplementation(okFetch);

      const term = makeTerm();
      const writePrompt = vi.fn();

      const execPromise = cmd.execute({ term, writePrompt, args: [] });
      await vi.runAllTimersAsync();
      await execPromise;

      expect(fetch).toHaveBeenCalled();
      expect(writePrompt).toHaveBeenCalled();
    });
  });

  describe('service never comes back (exhausts MAX_ATTEMPTS)', () => {
    it('shows timeout message after all attempts fail', async () => {
      vi.mocked(ApiService.post).mockResolvedValue({ success: true, message: 'ok' });
      vi.mocked(fetch).mockImplementation(failFetch);

      const term = makeTerm();
      const writePrompt = vi.fn();

      const execPromise = cmd.execute({ term, writePrompt, args: [] });
      await vi.runAllTimersAsync();
      await execPromise;

      expect(lines(term)).toContain('did not respond');
      expect(writePrompt).toHaveBeenCalled();
    });
  });
});
