import { BaseCommand, type CommandContext } from './BaseCommand';
import { useSystemStore } from '@/stores/system';

export class StatusCommand extends BaseCommand {
  name = 'status';
  description = 'Show repeater status';
  aliases = ['st'];

  execute({ term, writePrompt }: CommandContext): void {
    const data = useSystemStore().stats;

    if (data && typeof data === 'object') {
      this.writeSuccess(term, 'Repeater Status:');
      term.writeln('');
      for (const [key, value] of Object.entries(data)) {
        term.writeln(`  \x1b[36m${key.padEnd(20)}\x1b[0m ${value}`);
      }
    } else {
      this.writeError(term, 'No status data available');
    }

    writePrompt();
  }
}
