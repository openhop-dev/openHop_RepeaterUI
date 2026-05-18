import { BaseCommand, type CommandContext } from './BaseCommand';
import ApiService from '@/utils/api';
import {
  RESTART_POLL_ENDPOINT,
  RESTART_INITIAL_DELAY_MS,
  RESTART_POLL_INTERVAL_MS,
  RESTART_MAX_ATTEMPTS,
} from '@/utils/constants';

interface RestartResponse {
  success?: boolean;
  message?: string;
  error?: string;
}

export class RestartCommand extends BaseCommand {
  name = 'restart';
  description = 'Restart the pymc-repeater service';
  aliases = ['reboot'];

  matches(input: string): boolean {
    const lower = input.toLowerCase();
    return lower === 'restart' || lower === 'reboot';
  }

  async execute({ term, writePrompt }: CommandContext): Promise<void> {
    this.writeLine(term, '');
    this.writeLine(term, '\x1b[33m⚠️  This will restart the repeater service!\x1b[0m');
    this.writeLine(term, '');
    this.writeInfo(term, 'Attempting to restart service...');

    const stopLoading = this.startLoading(term, 'Restarting...');

    try {
      const response = await ApiService.post<RestartResponse>(
        '/restart_service',
        {},
        {
          timeout: 10000, // 10 second timeout
        },
      );

      stopLoading();

      if (response.success) {
        this.writeLine(term, '');
        this.writeSuccess(term, response.message || 'Service restart initiated');
        this.writeLine(term, '');
        this.writeInfo(
          term,
          'The service will restart momentarily. You may need to refresh this page.',
        );
      } else {
        this.writeLine(term, '');
        this.writeError(
          term,
          'Restart failed: ' + (response.error || response.message || 'Unknown error'),
        );
        this.writeLine(term, '');
        this.writeInfo(
          term,
          'You may need to manually restart: sudo systemctl restart pymc-repeater',
        );
      }
    } catch (error: unknown) {
      stopLoading();
      this.writeLine(term, '');

      const err = error as { code?: string; message?: string; response?: { status?: number } };

      // Network errors (ECONNRESET, ERR_NETWORK, etc.) likely mean the service restarted successfully
      if (
        err.code === 'ERR_NETWORK' ||
        err.message?.includes('Network error') ||
        err.message?.includes('ECONNRESET') ||
        err.code === 'ECONNRESET'
      ) {
        this.writeSuccess(term, 'Service restart initiated successfully');
        this.writeLine(term, '');

        // Wait for service to come back up
        await this.waitForServiceRestart(term, writePrompt);
        return;
      } else if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        // Timeout might mean service is restarting
        this.writeLine(term, '\x1b[33m⚠️  Request timed out - service may be restarting\x1b[0m');
        this.writeLine(term, '');
        this.writeInfo(term, 'Refresh the page in a few seconds to reconnect.');
      } else if (err.response?.status === 403 || err.response?.status === 401) {
        this.writeError(term, 'Permission denied. Polkit rules may need configuration.');
        this.writeLine(term, '');
        this.writeInfo(
          term,
          "Run: sudo bash -c 'mkdir -p /etc/polkit-1/rules.d && cat > /etc/polkit-1/rules.d/10-pymc-repeater.rules <<EOF",
        );
        this.writeInfo(term, 'polkit.addRule(function(action, subject) {');
        this.writeInfo(term, '    if (action.id == "org.freedesktop.systemd1.manage-units" &&');
        this.writeInfo(term, '        action.lookup("unit") == "pymc-repeater.service" &&');
        this.writeInfo(term, '        subject.user == "repeater") { return polkit.Result.YES; }');
        this.writeInfo(term, '});');
        this.writeInfo(term, "EOF'");
      } else {
        this.writeError(term, 'Restart failed: ' + (err.message || 'Unknown error'));
        this.writeLine(term, '');
        this.writeInfo(term, 'Try manually: sudo systemctl restart pymc-repeater');
      }
    }

    this.writeLine(term, '');
    writePrompt();
  }

  private async waitForServiceRestart(term: any, writePrompt: () => void): Promise<void> {
    const initialDelay = RESTART_INITIAL_DELAY_MS / 1000;
    const maxWaitTime = (RESTART_MAX_ATTEMPTS * RESTART_POLL_INTERVAL_MS) / 1000 + initialDelay;
    const checkInterval = RESTART_POLL_INTERVAL_MS / 1000;

    this.writeInfo(term, 'Service restart initiated...');
    this.writeLine(term, '');

    // Initial delay countdown
    for (let i = initialDelay; i > 0; i--) {
      term.write(`\r\x1b[36m⏳\x1b[0m Restarting service... ${i}s`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    term.write('\r\x1b[K'); // Clear the delay line

    let elapsed = initialDelay;
    let checkCount = 0;

    // Show countdown while checking
    const countdownLine = '\r\x1b[36m⏳\x1b[0m Verifying restart (attempt ';

    while (elapsed < maxWaitTime) {
      checkCount++;
      term.write(`${countdownLine}${checkCount})... `);

      // Try to connect
      try {
        // Use a direct axios call with timeout config instead of ApiService.get
        const response = await fetch(
          `${window.location.protocol}//${window.location.host}${RESTART_POLL_ENDPOINT}`,
          {
            signal: AbortSignal.timeout(3000),
          },
        );

        if (response.ok) {
          // Success! Service is back up
          term.write('\r\x1b[K'); // Clear the countdown line
          this.writeLine(term, '');
          this.writeSuccess(term, `Service is back online! (took ~${elapsed}s)`);
          this.writeLine(term, '');
          writePrompt();
          return;
        }
      } catch (e: unknown) {
        // Still down, keep waiting
        const error = e as { code?: string; message?: string };
        // Only show error if it's not a network/timeout issue
        if (error.code && !['ERR_NETWORK', 'ECONNREFUSED', 'ECONNRESET'].includes(error.code)) {
          term.write(`[${error.code}] `);
        }
      }

      await new Promise((resolve) => setTimeout(resolve, checkInterval * 1000));
      elapsed += checkInterval;
    }

    // Timeout - service didn't come back
    term.write('\r\x1b[K'); // Clear the countdown line
    this.writeLine(term, '');
    this.writeLine(term, '\x1b[33m⚠️  Service did not respond within 20 seconds\x1b[0m');
    this.writeLine(term, '');
    this.writeInfo(term, 'The service may still be starting. Try: status');
    this.writeLine(term, '');
    writePrompt();
  }
}
