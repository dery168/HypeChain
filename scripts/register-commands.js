import { REST, Routes } from 'discord.js';
import { config } from '../src/config.js';
import { commandDefinitions } from '../src/commands.js';

const rest = new REST({ version: '10' }).setToken(config.discordToken);

async function registerCommands() {
  const route = config.discordGuildId
    ? Routes.applicationGuildCommands(config.discordClientId, config.discordGuildId)
    : Routes.applicationCommands(config.discordClientId);

  await rest.put(route, { body: commandDefinitions });
  console.log(
    config.discordGuildId
      ? `Registered guild command(s) to guild ${config.discordGuildId}.`
      : 'Registered global command(s).'
  );
}

registerCommands().catch((error) => {
  console.error(error);
  process.exit(1);
});
