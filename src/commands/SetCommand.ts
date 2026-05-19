import { BaseCommand, type CommandContext } from './BaseCommand';
import ApiService from '@/utils/api';
import type { Terminal } from '@xterm/xterm';
import { useSystemStore } from '@/stores/system';

interface UpdateConfigResponse {
  applied?: string[];
  persisted?: boolean;
  live_update?: boolean;
  restart_required?: boolean;
  message?: string;
}

export class SetCommand extends BaseCommand {
  name = 'set';
  description = 'Set configuration values (tx, txdelay, mode, duty, etc.)';

  matches(input: string): boolean {
    const lower = input.toLowerCase();
    return lower === 'set' || lower.startsWith('set ');
  }

  async execute({ term, args, writePrompt }: CommandContext): Promise<void> {
    const param = args[0]?.toLowerCase();
    const value = args.slice(1).join(' ').trim();

    if (!param) {
      this.writeError(term, 'Usage: set <parameter> <value>');
      this.writeLine(term, '');
      this.writeInfo(term, 'Available parameters:');
      this.writeLine(term, '');
      this.writeLine(term, '  \x1b[33mRadio:\x1b[0m');
      this.writeLine(term, '  \x1b[36mtx <2-30>\x1b[0m                TX power in dBm');
      this.writeLine(
        term,
        '  \x1b[36mfreq <MHz>\x1b[0m               Frequency (100-1000 MHz) *restart required*',
      );
      this.writeLine(
        term,
        '  \x1b[36mbw <kHz>\x1b[0m                 Bandwidth (7.8-500 kHz) *restart required*',
      );
      this.writeLine(
        term,
        '  \x1b[36msf <5-12>\x1b[0m                Spreading factor *restart required*',
      );
      this.writeLine(
        term,
        '  \x1b[36mcr <5-8>\x1b[0m                 Coding rate (for 4/5 to 4/8) *restart required*',
      );
      this.writeLine(term, '');
      this.writeLine(term, '  \x1b[33mTiming:\x1b[0m');
      this.writeLine(term, '  \x1b[36mtxdelay <0.0-5.0>\x1b[0m        TX delay factor');
      this.writeLine(term, '  \x1b[36mdirect.txdelay <0.0-5.0>\x1b[0m Direct TX delay factor');
      this.writeLine(term, '  \x1b[36mrxdelay <value>\x1b[0m          RX delay base (>= 0)');
      this.writeLine(term, '');
      this.writeLine(term, '  \x1b[33mIdentity:\x1b[0m');
      this.writeLine(term, '  \x1b[36mname <name>\x1b[0m              Node name');
      this.writeLine(term, '  \x1b[36mlat <-90 to 90>\x1b[0m          Latitude');
      this.writeLine(term, '  \x1b[36mlon <-180 to 180>\x1b[0m        Longitude');
      this.writeLine(term, '');
      this.writeLine(term, '  \x1b[33mRepeater:\x1b[0m');
      this.writeLine(term, '  \x1b[36mmode <forward|monitor|no_tx>\x1b[0m   Repeater mode');
      this.writeLine(term, '  \x1b[36mduty <on|off>\x1b[0m            Duty cycle enforcement');
      this.writeLine(term, '  \x1b[36mflood.max <0-64>\x1b[0m         Max flood hops');
      this.writeLine(term, '  \x1b[36madvert.interval <mins>\x1b[0m   Local advert interval');
      this.writeLine(term, '');
      writePrompt();
      return;
    }

    const stopLoading = this.startLoading(term, 'Updating configuration...');

    try {
      let response;

      switch (param) {
        // Radio Configuration
        case 'tx': {
          const power = parseInt(value);
          if (isNaN(power) || power < 2 || power > 30) {
            stopLoading();
            this.writeError(term, 'TX power must be 2-30 dBm');
            writePrompt();
            return;
          }
          response = await ApiService.post<UpdateConfigResponse>(
            '/update_radio_config',
            {
              tx_power: power,
            },
            {
              timeout: 30000, // 30 second timeout for config operations
            },
          );
          break;
        }

        case 'freq': {
          const freq = parseFloat(value);
          if (isNaN(freq) || freq < 100 || freq > 1000) {
            stopLoading();
            this.writeError(term, 'Frequency must be 100-1000 MHz');
            writePrompt();
            return;
          }
          response = await ApiService.post<UpdateConfigResponse>(
            '/update_radio_config',
            {
              frequency: freq * 1_000_000, // Convert MHz to Hz
            },
            {
              timeout: 30000,
            },
          );
          break;
        }

        case 'bw': {
          const bw = parseFloat(value);
          const validBw = [7.8, 10.4, 15.6, 20.8, 31.25, 41.7, 62.5, 125, 250, 500];
          if (isNaN(bw) || !validBw.includes(bw)) {
            stopLoading();
            this.writeError(term, `Bandwidth must be one of: ${validBw.join(', ')} kHz`);
            writePrompt();
            return;
          }
          response = await ApiService.post<UpdateConfigResponse>(
            '/update_radio_config',
            {
              bandwidth: bw * 1000, // Convert kHz to Hz
            },
            {
              timeout: 30000,
            },
          );
          break;
        }

        case 'sf': {
          const sf = parseInt(value);
          if (isNaN(sf) || sf < 5 || sf > 12) {
            stopLoading();
            this.writeError(term, 'Spreading factor must be 5-12');
            writePrompt();
            return;
          }
          response = await ApiService.post<UpdateConfigResponse>(
            '/update_radio_config',
            {
              spreading_factor: sf,
            },
            {
              timeout: 30000,
            },
          );
          break;
        }

        case 'cr': {
          const cr = parseInt(value);
          if (isNaN(cr) || cr < 5 || cr > 8) {
            stopLoading();
            this.writeError(term, 'Coding rate must be 5-8 (for 4/5 to 4/8)');
            writePrompt();
            return;
          }
          response = await ApiService.post<UpdateConfigResponse>(
            '/update_radio_config',
            {
              coding_rate: cr,
            },
            {
              timeout: 30000,
            },
          );
          break;
        }

        case 'af':
        case 'txdelay': {
          const factor = parseFloat(value);
          if (isNaN(factor) || factor < 0.0 || factor > 5.0) {
            stopLoading();
            this.writeError(term, 'TX delay factor must be 0.0-5.0');
            writePrompt();
            return;
          }
          response = await ApiService.post<UpdateConfigResponse>(
            '/update_radio_config',
            {
              tx_delay_factor: factor,
            },
            {
              timeout: 30000,
            },
          );
          break;
        }

        case 'direct.txdelay': {
          const factor = parseFloat(value);
          if (isNaN(factor) || factor < 0.0 || factor > 5.0) {
            stopLoading();
            this.writeError(term, 'Direct TX delay factor must be 0.0-5.0');
            writePrompt();
            return;
          }
          response = await ApiService.post<UpdateConfigResponse>(
            '/update_radio_config',
            {
              direct_tx_delay_factor: factor,
            },
            {
              timeout: 30000,
            },
          );
          break;
        }

        case 'rxdelay': {
          const delay = parseFloat(value);
          if (isNaN(delay) || delay < 0.0) {
            stopLoading();
            this.writeError(term, 'RX delay must be >= 0');
            writePrompt();
            return;
          }
          response = await ApiService.post<UpdateConfigResponse>(
            '/update_radio_config',
            {
              rx_delay_base: delay,
            },
            {
              timeout: 30000,
            },
          );
          break;
        }

        // Identity & Location
        case 'name': {
          if (!value.trim()) {
            stopLoading();
            this.writeError(term, 'Node name cannot be empty');
            writePrompt();
            return;
          }
          response = await ApiService.post<UpdateConfigResponse>(
            '/update_radio_config',
            {
              node_name: value.trim(),
            },
            {
              timeout: 30000,
            },
          );
          break;
        }

        case 'lat': {
          const lat = parseFloat(value);
          if (isNaN(lat) || lat < -90 || lat > 90) {
            stopLoading();
            this.writeError(term, 'Latitude must be -90 to 90');
            writePrompt();
            return;
          }
          response = await ApiService.post<UpdateConfigResponse>(
            '/update_radio_config',
            {
              latitude: lat,
            },
            {
              timeout: 30000,
            },
          );
          break;
        }

        case 'lon': {
          const lon = parseFloat(value);
          if (isNaN(lon) || lon < -180 || lon > 180) {
            stopLoading();
            this.writeError(term, 'Longitude must be -180 to 180');
            writePrompt();
            return;
          }
          response = await ApiService.post<UpdateConfigResponse>(
            '/update_radio_config',
            {
              longitude: lon,
            },
            {
              timeout: 30000,
            },
          );
          break;
        }

        // Repeater Configuration
        case 'mode': {
          const mode = value.toLowerCase();
          if (mode !== 'forward' && mode !== 'monitor' && mode !== 'no_tx') {
            stopLoading();
            this.writeError(term, 'Mode must be "forward", "monitor", or "no_tx"');
            this.writeLine(term, '');
            this.writeInfo(term, 'Valid values:');
            this.writeLine(term, '  \x1b[36mforward\x1b[0m  - Forward packets');
            this.writeLine(term, '  \x1b[36mmonitor\x1b[0m  - Monitor only (no forwarding)');
            this.writeLine(
              term,
              '  \x1b[36mno_tx\x1b[0m    - No repeat, no local TX; adverts skipped',
            );
            writePrompt();
            return;
          }
          // Use set_mode endpoint which handles both setting and persisting
          response = await ApiService.post<UpdateConfigResponse>(
            '/set_mode',
            {
              mode,
            },
            {
              timeout: 30000,
            },
          );
          // Format response to match other commands
          if (response.data) {
            response.data.applied = [`mode=${mode}`];
            response.data.persisted = true;
            response.data.live_update = true;
          }
          break;
        }

        case 'duty': {
          const state = value.toLowerCase();
          if (state !== 'on' && state !== 'off') {
            stopLoading();
            this.writeError(term, 'Duty cycle must be "on" or "off"');
            this.writeLine(term, '');
            this.writeInfo(term, 'Valid values:');
            this.writeLine(term, '  \x1b[36mon\x1b[0m   - Enable duty cycle enforcement');
            this.writeLine(term, '  \x1b[36moff\x1b[0m  - Disable duty cycle enforcement');
            writePrompt();
            return;
          }
          const enabled = state === 'on';
          // Use set_duty_cycle endpoint which handles both setting and persisting
          response = await ApiService.post<UpdateConfigResponse>(
            '/set_duty_cycle',
            {
              enabled,
            },
            {
              timeout: 30000,
            },
          );
          // Format response to match other commands
          if (response.data) {
            response.data.applied = [`duty=${state}`];
            response.data.persisted = true;
            response.data.live_update = true;
          }
          break;
        }

        case 'flood.max': {
          const hops = parseInt(value);
          if (isNaN(hops) || hops < 0 || hops > 64) {
            stopLoading();
            this.writeError(term, 'Max flood hops must be 0-64');
            writePrompt();
            return;
          }
          response = await ApiService.post<UpdateConfigResponse>(
            '/update_radio_config',
            {
              max_flood_hops: hops,
            },
            {
              timeout: 30000,
            },
          );
          break;
        }

        case 'flood.advert.interval': {
          const hours = parseInt(value);
          if (isNaN(hours) || (hours !== 0 && (hours < 3 || hours > 48))) {
            stopLoading();
            this.writeError(term, 'Flood advert interval must be 0 (off) or 3-48 hours');
            writePrompt();
            return;
          }
          response = await ApiService.post<UpdateConfigResponse>(
            '/update_radio_config',
            {
              flood_advert_interval_hours: hours,
            },
            {
              timeout: 30000,
            },
          );
          break;
        }

        case 'advert.interval': {
          const mins = parseInt(value);
          if (isNaN(mins) || (mins !== 0 && (mins < 1 || mins > 10080))) {
            stopLoading();
            this.writeError(term, 'Advert interval must be 0 (off) or 1-10080 minutes');
            writePrompt();
            return;
          }
          response = await ApiService.post<UpdateConfigResponse>(
            '/update_radio_config',
            {
              advert_interval_minutes: mins,
            },
            {
              timeout: 30000,
            },
          );
          break;
        }

        // Log level - not implemented
        case 'log':
          stopLoading();
          this.writeWarning(term, 'Log level configuration not yet implemented');
          this.writeInfo(term, 'Backend endpoint /set_log_level does not exist');
          writePrompt();
          return;

        default:
          stopLoading();
          this.writeError(term, `Unknown parameter: ${param}`);
          this.writeLine(term, '');
          this.writeInfo(term, 'Type "set" without arguments to see available parameters');
          writePrompt();
          return;
      }

      stopLoading();

      // Handle response
      const data = (response.data || response) as UpdateConfigResponse;

      if (response.success) {
        // Show what was applied
        if (data.applied && data.applied.length > 0) {
          this.writeSuccess(term, `Configuration updated: ${data.applied.join(', ')}`);
        } else {
          this.writeSuccess(term, 'Configuration updated');
        }

        // Refresh cached stats so GetCommand and the UI reflect the new values immediately
        void useSystemStore().fetchStats();

        // Show restart message only if required
        if (data.restart_required) {
          this.writeLine(term, '');
          this.writeWarning(term, '⚠ Service restart required for changes to take effect');
          this.writeInfo(term, 'Run: sudo systemctl restart pymc_repeater');
        } else if (data.message && !data.live_update) {
          this.writeLine(term, '');
          this.writeInfo(term, data.message);
        }
      } else {
        this.writeError(
          term,
          (response as { error?: string }).error || 'Failed to update configuration',
        );
      }
    } catch (error) {
      stopLoading();
      this.writeError(term, `Failed to update ${param}: ${error}`);
    }

    this.writeLine(term, '');
    writePrompt();
  }

  private writeWarning(term: Terminal, message: string): void {
    term.writeln(`\x1b[1;33m⚠ Warning:\x1b[0m ${message}`);
  }
}
