import { BaseCommand, type CommandContext } from './BaseCommand';
import ApiService from '@/utils/api';

interface CliReply {
  reply?: string;
}

const HEX_PREFIX_RE = /^[0-9a-fA-F]+$/;

export class NeighborRemoveCommand extends BaseCommand {
  name = 'neighbor.remove';
  description = 'Remove neighbors by pubkey prefix';
  usage = 'neighbor.remove <hex_prefix | --all>';

  async execute({ term, args, writePrompt }: CommandContext): Promise<void> {
    if (args.length > 1) {
      this.writeError(term, 'Too many arguments');
      term.writeln('');
      this.writeInfo(term, `Usage: ${this.usage}`);
      writePrompt();
      return;
    }

    if (args.length === 0) {
      this.writeError(term, 'Missing pubkey prefix');
      term.writeln('');
      this.writeInfo(term, `Usage: ${this.usage}`);
      this.writeInfo(term, 'Use --all to remove all neighbors');
      writePrompt();
      return;
    }

    let command = '';
    const arg = args[0].trim();

    if (arg === '--all' || arg.toLowerCase() === 'all') {
      // The backend CLI treats whitespace-only suffix as remove-all.
      command = 'neighbor.remove ';
    } else {
      const normalized = arg.startsWith('0x') ? arg.slice(2) : arg;
      if (!normalized || !HEX_PREFIX_RE.test(normalized)) {
        this.writeError(term, 'Prefix must be hex characters (0-9, a-f)');
        term.writeln('');
        this.writeInfo(term, `Usage: ${this.usage}`);
        writePrompt();
        return;
      }
      command = `neighbor.remove ${normalized}`;
    }

    const stopLoading = this.startLoading(term, 'Removing neighbors...');

    try {
      const response = await ApiService.post<CliReply>('/cli', { command });

      stopLoading();

      if (response.success === false) {
        this.writeError(term, response.error || 'Failed to remove neighbors');
      } else {
        const reply = response.data?.reply || response.message || 'Neighbor removal complete';
        this.writeSuccess(term, reply);
      }
    } catch (error) {
      stopLoading();
      this.writeError(term, error instanceof Error ? error.message : 'Failed to remove neighbors');
    }

    writePrompt();
  }
}
