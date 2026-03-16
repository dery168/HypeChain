import { SlashCommandBuilder } from 'discord.js';

export const commandDefinitions = [
  new SlashCommandBuilder()
    .setName('propose')
    .setDescription('Create a new Hype Chain proposal')
    .addStringOption((option) =>
      option
        .setName('text')
        .setDescription('What should people join?')
        .setRequired(true)
        .setMaxLength(500)
    )
].map((cmd) => cmd.toJSON());
