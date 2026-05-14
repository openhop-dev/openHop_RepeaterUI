import { BaseCommand, type CommandContext } from './BaseCommand';
import type { Terminal } from '@xterm/xterm';
import { useSystemStore } from '@/stores/system';

export class GetCommand extends BaseCommand {
  name = 'get';
  description = 'Get configuration values (name, freq, tx, mode, duty, etc.)';

  matches(input: string): boolean {
    const lower = input.toLowerCase();
    return lower === 'get' || lower.startsWith('get ');
  }

  execute({ term, args, writePrompt }: CommandContext): void {
    const param = args[0]?.toLowerCase();

    if (!param) {
      this.writeError(term, 'Usage: get <parameter>');
      this.writeLine(term, '');
      this.writeInfo(term, 'Available parameters:');
      this.writeLine(term, '');
      this.writeLine(term, '  \x1b[36mname\x1b[0m                Node name');
      this.writeLine(term, '  \x1b[36mrole\x1b[0m                Node role');
      this.writeLine(term, '  \x1b[36mlat\x1b[0m                 Latitude');
      this.writeLine(term, '  \x1b[36mlon\x1b[0m                 Longitude');
      this.writeLine(term, '  \x1b[36mfreq\x1b[0m                Frequency (MHz)');
      this.writeLine(term, '  \x1b[36mtx\x1b[0m                  TX power (dBm)');
      this.writeLine(term, '  \x1b[36mbw\x1b[0m                  Bandwidth (kHz)');
      this.writeLine(term, '  \x1b[36msf\x1b[0m                  Spreading factor');
      this.writeLine(term, '  \x1b[36mcr\x1b[0m                  Coding rate');
      this.writeLine(term, '  \x1b[36mradio\x1b[0m               All radio settings');
      this.writeLine(term, '  \x1b[36mtxdelay\x1b[0m             TX delay factor');
      this.writeLine(term, '  \x1b[36mdirect.txdelay\x1b[0m      Direct TX delay');
      this.writeLine(term, '  \x1b[36mrxdelay\x1b[0m             RX delay base');
      this.writeLine(term, '  \x1b[36maf\x1b[0m                  Airtime factor');
      this.writeLine(term, '  \x1b[36mmode\x1b[0m                Repeater mode');
      this.writeLine(term, '  \x1b[36mrepeat\x1b[0m              Repeat on/off');
      this.writeLine(term, '  \x1b[36mflood.max\x1b[0m           Max flood hops');
      this.writeLine(term, '  \x1b[36madvert.interval\x1b[0m     Advert interval');
      this.writeLine(term, '  \x1b[36mduty\x1b[0m                Duty cycle enabled');
      this.writeLine(term, '  \x1b[36mduty.max\x1b[0m            Max airtime %');
      this.writeLine(term, '  \x1b[36mpublic.key\x1b[0m          Public key');
      this.writeLine(term, '');
      writePrompt();
      return;
    }

    const stats = useSystemStore().stats;
    if (!stats) {
      this.writeError(term, 'System stats not available');
      writePrompt();
      return;
    }

    {
      const data = stats as Record<string, unknown>;
      const config = (data.config || {}) as Record<string, unknown>;
      const radio = (config.radio || {}) as Record<string, unknown>;
      const repeater = (config.repeater || {}) as Record<string, unknown>;
      const delays = (config.delays || {}) as Record<string, unknown>;
      const dutyCycle = (config.duty_cycle || {}) as Record<string, unknown>;

      let result = '';

      switch (param) {
        // Identity & Location
        case 'name':
          result = (config.node_name as string) || 'Unknown';
          break;
        case 'role':
          result = 'repeater';
          break;
        case 'lat':
          result = repeater.latitude != null ? String(repeater.latitude) : 'not set';
          break;
        case 'lon':
          result = repeater.longitude != null ? String(repeater.longitude) : 'not set';
          break;

        // Radio Configuration
        case 'freq':
          result = radio.frequency
            ? `${((radio.frequency as number) / 1_000_000).toFixed(3)} MHz`
            : '?';
          break;
        case 'tx':
          result = radio.tx_power != null ? `${radio.tx_power}dBm` : '?';
          break;
        case 'bw':
          result = radio.bandwidth ? `${(radio.bandwidth as number) / 1000} kHz` : '?';
          break;
        case 'sf':
          result = radio.spreading_factor != null ? String(radio.spreading_factor) : '?';
          break;
        case 'cr':
          result = radio.coding_rate != null ? `4/${radio.coding_rate}` : '?';
          break;
        case 'radio':
          if (radio.frequency) {
            this.writeSuccess(term, 'Radio Configuration:');
            this.writeLine(term, '');
            this.writeLine(
              term,
              `  \x1b[36mFrequency:\x1b[0m       ${((radio.frequency as number) / 1_000_000).toFixed(3)} MHz`,
            );
            this.writeLine(
              term,
              `  \x1b[36mBandwidth:\x1b[0m       ${(radio.bandwidth as number) / 1000} kHz`,
            );
            this.writeLine(term, `  \x1b[36mSpreading Factor:\x1b[0m ${radio.spreading_factor}`);
            this.writeLine(term, `  \x1b[36mCoding Rate:\x1b[0m     4/${radio.coding_rate}`);
            this.writeLine(term, `  \x1b[36mTX Power:\x1b[0m        ${radio.tx_power}dBm`);
            this.writeLine(term, '');
            writePrompt();
            return;
          } else {
            result = 'Radio configuration not available';
          }
          break;

        // Timing & Delays
        case 'af':
        case 'txdelay':
          result =
            delays.tx_delay_factor != null
              ? String(delays.tx_delay_factor)
              : '\x1b[90mnot set (default: 1.0)\x1b[0m';
          break;
        case 'direct.txdelay':
          result =
            delays.direct_tx_delay_factor != null
              ? String(delays.direct_tx_delay_factor)
              : '\x1b[90mnot set (default: 0.5)\x1b[0m';
          break;
        case 'rxdelay':
          result =
            delays.rx_delay_base != null
              ? `${delays.rx_delay_base}s`
              : '\x1b[90mnot set (default: 0.0s)\x1b[0m';
          break;

        // Repeater Settings
        case 'mode':
          result =
            repeater.mode != null
              ? (repeater.mode as string)
              : '\x1b[90mnot set (default: forward)\x1b[0m';
          break;
        case 'repeat':
          if (repeater.mode != null) {
            result = repeater.mode === 'forward' ? 'on' : 'off';
          } else {
            result = '\x1b[90mnot set (default: on)\x1b[0m';
          }
          break;
        case 'flood.max':
          result =
            repeater.max_flood_hops != null
              ? String(repeater.max_flood_hops)
              : '\x1b[90mnot set (default: 3)\x1b[0m';
          break;
        case 'flood.advert.interval':
          result =
            repeater.send_advert_interval_hours != null
              ? `${repeater.send_advert_interval_hours}h`
              : '\x1b[90mnot set\x1b[0m';
          break;
        case 'advert.interval':
          result =
            repeater.advert_interval_minutes != null
              ? `${repeater.advert_interval_minutes}m`
              : '\x1b[90mnot set (default: 120m)\x1b[0m';
          break;

        // Duty Cycle
        case 'duty':
        case 'duty.enabled':
          result =
            dutyCycle.enforcement_enabled != null
              ? dutyCycle.enforcement_enabled
                ? 'on'
                : 'off'
              : '\x1b[90mnot set (default: off)\x1b[0m';
          break;
        case 'duty.max':
          result =
            dutyCycle.max_airtime_percent != null
              ? `${dutyCycle.max_airtime_percent}%`
              : '\x1b[90mnot set\x1b[0m';
          break;

        // Security & Keys
        case 'public.key':
          result = (data.public_key as string) || '\x1b[90mnot available\x1b[0m';
          break;
        case 'prv.key':
          this.writeWarning(term, 'Private key not exposed via API for security');
          this.writeInfo(term, 'Check /etc/pymc_repeater/config.yaml');
          writePrompt();
          return;
        case 'guest.password':
        case 'allow.read.only':
          this.writeWarning(term, 'Security settings not exposed via API');
          this.writeInfo(term, 'Check /etc/pymc_repeater/config.yaml');
          writePrompt();
          return;

        default:
          this.writeError(term, `Unknown parameter: ${param}`);
          this.writeLine(term, '');
          this.writeInfo(term, 'Available parameters:');
          this.writeInfo(term, '  Identity:  name, role, lat, lon');
          this.writeInfo(term, '  Radio:     freq, tx, bw, sf, cr, radio');
          this.writeInfo(term, '  Timing:    txdelay, direct.txdelay, rxdelay, af');
          this.writeInfo(term, '  Repeater:  mode, repeat, flood.max, advert.interval');
          this.writeInfo(term, '  Duty:      duty, duty.max');
          this.writeInfo(term, '  Security:  public.key');
          writePrompt();
          return;
      }

      this.writeSuccess(term, result);
    }

    writePrompt();
  }

  private writeWarning(term: Terminal, message: string): void {
    term.writeln(`\x1b[1;33m⚠ Warning:\x1b[0m ${message}`);
  }
}
