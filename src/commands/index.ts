import { BaseCommand } from './BaseCommand';
import { HelpCommand } from './HelpCommand';
import { ClearCommand } from './ClearCommand';
import { StatusCommand } from './StatusCommand';
import { UptimeCommand } from './UptimeCommand';
import { PacketsCommand } from './PacketsCommand';
import { BoardCommand } from './BoardCommand';
import { AdvertCommand } from './AdvertCommand';
import { GetCommand } from './GetCommand';
import { SetCommand } from './SetCommand';
import { IdentitiesCommand } from './IdentitiesCommand';
import { KeysCommand } from './KeysCommand';
import { NeighborsCommand } from './NeighborsCommand';
import { AclCommand } from './AclCommand';
import { RoomsCommand } from './RoomsCommand';
import { RestartCommand } from './RestartCommand';
import { PingCommand } from './PingCommand';
import { DiscoverNeighborsCommand } from './DiscoverNeighborsCommand';
import { NeighborRemoveCommand } from './NeighborRemoveCommand';
import { RegionCommand } from './RegionCommand';

export class CommandRegistry {
  private commands: BaseCommand[] = [];

  constructor() {
    // Register commands (order matters for help display)
    const clearCmd = new ClearCommand();
    const statusCmd = new StatusCommand();
    const uptimeCmd = new UptimeCommand();
    const packetsCmd = new PacketsCommand();
    const boardCmd = new BoardCommand();
    const advertCmd = new AdvertCommand();
    const getCmd = new GetCommand();
    const setCmd = new SetCommand();
    const identitiesCmd = new IdentitiesCommand();
    const keysCmd = new KeysCommand();
    const neighborsCmd = new NeighborsCommand();
    const aclCmd = new AclCommand();
    const roomsCmd = new RoomsCommand();
    const restartCmd = new RestartCommand();
    const pingCmd = new PingCommand();
    const discoverNeighborsCmd = new DiscoverNeighborsCommand();
    const neighborRemoveCmd = new NeighborRemoveCommand();
    const regionCmd = new RegionCommand();

    // Help command needs access to all commands
    const helpCmd = new HelpCommand([
      clearCmd,
      statusCmd,
      uptimeCmd,
      packetsCmd,
      boardCmd,
      advertCmd,
      getCmd,
      setCmd,
      identitiesCmd,
      keysCmd,
      neighborsCmd,
      aclCmd,
      roomsCmd,
      restartCmd,
      pingCmd,
      discoverNeighborsCmd,
      neighborRemoveCmd,
      regionCmd,
    ]);

    this.commands = [
      helpCmd,
      clearCmd,
      statusCmd,
      uptimeCmd,
      packetsCmd,
      boardCmd,
      advertCmd,
      getCmd,
      setCmd,
      identitiesCmd,
      keysCmd,
      neighborsCmd,
      aclCmd,
      roomsCmd,
      restartCmd,
      pingCmd,
      discoverNeighborsCmd,
      neighborRemoveCmd,
      regionCmd,
    ];
  }

  findCommand(input: string): BaseCommand | undefined {
    return this.commands.find((cmd) => cmd.matches(input));
  }

  getAllCommands(): BaseCommand[] {
    return this.commands;
  }

  getCommandNames(): string[] {
    return this.commands.map((cmd) => cmd.name);
  }
}

export { BaseCommand, type CommandContext } from './BaseCommand';
