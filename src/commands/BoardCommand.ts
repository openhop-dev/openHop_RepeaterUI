import { BaseCommand, type CommandContext } from './BaseCommand';
import { useSystemStore } from '@/stores/system';

export class BoardCommand extends BaseCommand {
  name = 'board';
  description = 'Show board information';

  execute({ term, writePrompt }: CommandContext): void {
    const stats = useSystemStore().stats;
    const boardInfo = (stats as any)?.board_info || 'pyMC_Repeater (Linux/RPi)';
    this.writeSuccess(term, boardInfo);
    writePrompt();
  }
}
