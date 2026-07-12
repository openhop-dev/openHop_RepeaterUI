import { BaseCommand, type CommandContext } from './BaseCommand';
import ApiService from '@/utils/api';

interface CliReply {
  reply?: string;
}

export class DiscoverNeighborsCommand extends BaseCommand {
  name = 'discover.neighbors';
  description = 'Start a one-shot neighbor discovery session';

  async execute({ term, args, writePrompt }: CommandContext): Promise<void> {
    if (args.length > 0) {
      this.writeError(term, 'This command does not take arguments');
      term.writeln('');
      this.writeInfo(term, 'Usage: discover.neighbors');
      writePrompt();
      return;
    }

    const stopLoading = this.startLoading(term, 'Starting neighbor discovery...');

    try {
      const response = await ApiService.post<CliReply>('/cli', {
        command: 'discover.neighbors',
      });

      stopLoading();

      if (response.success === false) {
        this.writeError(term, response.error || 'Failed to start discovery');
      } else {
        const reply = response.data?.reply || response.message || 'Discover sent';
        this.writeSuccess(term, reply);
      }
    } catch (error) {
      stopLoading();
      this.writeError(term, error instanceof Error ? error.message : 'Failed to start discovery');
    }

    writePrompt();
  }
}
