import { BaseCommand, type CommandContext } from './BaseCommand';
import ApiService from '@/utils/api';

export class RegionCommand extends BaseCommand {
  name = 'region';
  description = 'Get/set default region scope';
  usage = 'region default [name|<null>]';

  matches(input: string): boolean {
    const lower = input.toLowerCase();
    return lower === 'region' || lower.startsWith('region ');
  }

  async execute({ term, args, writePrompt }: CommandContext): Promise<void> {
    const sub = (args[0] || '').toLowerCase();

    if (!sub || sub !== 'default') {
      this.writeError(term, `Usage: ${this.usage}`);
      writePrompt();
      return;
    }

    // region default
    if (args.length === 1) {
      const stopLoading = this.startLoading(term, 'Reading default region...');
      try {
        const response = await ApiService.getDefaultRegion();
        stopLoading();

        if (response.success === false) {
          this.writeError(term, response.error || 'Failed to get default region');
          writePrompt();
          return;
        }

        const current = response.data?.default_region ?? null;
        term.writeln(` default scope is ${current ?? '<null>'}`);
      } catch (error) {
        stopLoading();
        this.writeError(term, error instanceof Error ? error.message : 'Failed to get default region');
      }

      writePrompt();
      return;
    }

    // region default <name|<null>>
    const rawValue = args.slice(1).join(' ').trim();
    if (!rawValue) {
      this.writeError(term, `Usage: ${this.usage}`);
      writePrompt();
      return;
    }

    const nextDefault = rawValue === '<null>' ? null : rawValue;
    const stopLoading = this.startLoading(term, 'Updating default region...');

    try {
      const response = await ApiService.updateDefaultRegion(nextDefault);
      stopLoading();

      if (response.success === false) {
        this.writeError(term, response.error || 'Failed to update default region');
        writePrompt();
        return;
      }

      term.writeln(` default scope is now ${nextDefault ?? '<null>'}`);
    } catch (error) {
      stopLoading();
      this.writeError(
        term,
        error instanceof Error ? error.message : 'Failed to update default region',
      );
    }

    writePrompt();
  }
}
