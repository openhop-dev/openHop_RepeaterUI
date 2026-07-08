import { BaseCommand, type CommandContext } from './BaseCommand';
import ApiService from '@/utils/api';
import { useSystemStore } from '@/stores/system';

const getTargetHashHexChars = (): number => {
  const pathHashMode = useSystemStore().stats?.config?.mesh?.path_hash_mode ?? 0;
  const byteCount = pathHashMode === 2 ? 3 : pathHashMode === 1 ? 2 : 1;
  return byteCount * 2;
};

export class PingCommand extends BaseCommand {
  name = 'ping';
  description = 'Ping a neighbor node to measure latency and signal quality';
  usage = 'ping <node_name_or_pubkey> [timeout_seconds]';

  async execute({ term, args, writePrompt }: CommandContext): Promise<void> {
    if (args.length === 0) {
      this.writeError(term, 'Missing target node');
      term.writeln('');
      this.writeInfo(term, `Usage: ${this.usage}`);
      term.writeln('');
      this.writeInfo(term, 'Examples:');
      this.writeInfo(term, '  ping MyNeighbor        - Ping node by name');
      this.writeInfo(term, '  ping 0xb5             - Ping node by pubkey hash');
      this.writeInfo(term, '  ping MyNeighbor 20    - Ping with 20s timeout');
      writePrompt();
      return;
    }

    const target = args[0];
    const timeout = args.length > 1 ? parseInt(args[1]) : 10;

    if (isNaN(timeout) || timeout < 1 || timeout > 60) {
      this.writeError(term, 'Invalid timeout. Must be between 1-60 seconds');
      writePrompt();
      return;
    }

    // Resolve target to pubkey hash
    let targetId: string | null = null;

    const hexChars = getTargetHashHexChars();

    // Check if target is already a hex format using the configured path hash width.
    const hexMatch = target.match(/^(0x)?([0-9a-fA-F]{1,6})$/);
    if (hexMatch) {
      if (hexMatch[2].length > hexChars) {
        this.writeError(
          term,
          `Invalid target hash. Current path hash mode expects up to ${hexChars} hex digits`,
        );
        writePrompt();
        return;
      }

      const hex = hexMatch[2].padStart(hexChars, '0');
      targetId = `0x${hex}`;
    } else {
      // Fetch neighbors and search by name
      const stopLoading = this.startLoading(term, 'Resolving target...');

      try {
        const contactTypes = ['Chat Node', 'Repeater', 'Room Server', 'Hybrid Node', 'Unknown'];
        let found = false;

        for (const contactType of contactTypes) {
          try {
            const response = await ApiService.get('/adverts_by_contact_type', {
              contact_type: contactType,
              hours: 168,
            });
            const data = response.success && response.data ? response.data : response;
            const adverts = Array.isArray(data) ? data : [];

            // Search for matching node name (case insensitive)
            const match = adverts.find(
              (adv: any) => adv.node_name && adv.node_name.toLowerCase() === target.toLowerCase(),
            );

            if (match && match.pubkey) {
              targetId = `0x${match.pubkey.substring(0, hexChars)}`;
              found = true;
              break;
            }
          } catch {
            continue;
          }
        }

        stopLoading();

        if (!found) {
          this.writeError(term, `Node '${target}' not found in neighbors`);
          term.writeln('');
          this.writeInfo(term, 'Try: neighbors  - to list available nodes');
          writePrompt();
          return;
        }
      } catch (err) {
        stopLoading();
        this.writeError(term, `Failed to resolve target: ${err}`);
        writePrompt();
        return;
      }
    }

    // Send ping
    this.writeLine(
      term,
      `\x1b[36mPinging ${target} (${targetId}) with ${timeout}s timeout...\x1b[0m`,
    );
    term.writeln('');

    const stopLoading = this.startLoading(term, 'Waiting for response...');

    try {
      const result = await ApiService.pingNeighbor(targetId!, timeout);

      stopLoading();

      if (result.success && result.data) {
        const data = result.data;

        // Success header
        this.writeSuccess(term, `Reply from ${target} (${data.target_id})`);
        term.writeln('');

        // RTT with color coding
        let rttColor = '\x1b[32m'; // green
        if (data.rtt_ms > 500)
          rttColor = '\x1b[31m'; // red
        else if (data.rtt_ms > 250) rttColor = '\x1b[33m'; // yellow

        term.writeln(
          `  \x1b[1mRound-Trip Time:\x1b[0m ${rttColor}${data.rtt_ms.toFixed(2)} ms\x1b[0m`,
        );

        // Signal metrics
        term.writeln(`  \x1b[1mRSSI:\x1b[0m           ${data.rssi} dBm`);
        term.writeln(`  \x1b[1mSNR:\x1b[0m            ${data.snr_db} dB`);

        // Network path
        if (data.path && data.path.length > 0) {
          const pathStr = data.path.join(' → ');
          const hops = data.path.length;
          term.writeln(`  \x1b[1mPath:\x1b[0m           ${pathStr}`);
          term.writeln(`  \x1b[1mHops:\x1b[0m           ${hops}`);
        }

        term.writeln('');

        // Quality assessment
        let quality = 'Excellent';
        let qualityColor = '\x1b[32m';
        if (data.rtt_ms > 500 || data.rssi < -120) {
          quality = 'Poor';
          qualityColor = '\x1b[31m';
        } else if (data.rtt_ms > 250 || data.rssi < -100) {
          quality = 'Fair';
          qualityColor = '\x1b[33m';
        } else if (data.rtt_ms > 100 || data.rssi < -80) {
          quality = 'Good';
          qualityColor = '\x1b[36m';
        }

        term.writeln(`  \x1b[1mLink Quality:\x1b[0m   ${qualityColor}${quality}\x1b[0m`);
      } else {
        this.writeError(term, result.error || 'Ping failed');
      }
    } catch (err: any) {
      stopLoading();
      this.writeError(term, `Ping failed: ${err.message || err}`);
    }

    term.writeln('');
    writePrompt();
  }
}

// Export helper to get neighbor names for tab completion
export async function getNeighborNames(): Promise<string[]> {
  try {
    const contactTypes = ['Chat Node', 'Repeater', 'Room Server', 'Hybrid Node', 'Unknown'];
    const names: string[] = [];

    for (const contactType of contactTypes) {
      try {
        const response = await ApiService.get('/adverts_by_contact_type', {
          contact_type: contactType,
          hours: 168,
        });
        const data = response.success && response.data ? response.data : response;
        const adverts = Array.isArray(data) ? data : [];

        adverts.forEach((adv: any) => {
          if (adv.node_name && !names.includes(adv.node_name)) {
            names.push(adv.node_name);
          }
        });
      } catch {
        continue;
      }
    }

    return names.sort();
  } catch {
    return [];
  }
}
