import { BaseCommand, type CommandContext } from './BaseCommand';
import { useSystemStore } from '@/stores/system';

export class UptimeCommand extends BaseCommand {
  name = 'uptime';
  description = 'Show system uptime';

  execute({ term, writePrompt }: CommandContext): void {
    const stats = useSystemStore().stats;
    const seconds = stats?.uptime_seconds || 0;
    this.writeSuccess(term, this.formatUptime(seconds));
    writePrompt();
  }

  private formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  }
}
