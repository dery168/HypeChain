import {
  ChannelType,
  Client,
  GatewayIntentBits,
  PermissionsBitField
} from 'discord.js';
import { config } from './config.js';
import {
  addIdeaMessage,
  createIdea,
  getIdea,
  getIdeaMessages,
  getParticipants,
  removeIdeaMessage,
  toggleParticipant
} from './db.js';
import { buildProposalActions, buildProposalEmbed } from './embed.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

function parseCustomId(customId) {
  const [action, ideaId] = customId.split(':');
  return { action, ideaId };
}

async function syncAllMessagesForIdea(ideaId) {
  const [idea, participants, links] = await Promise.all([
    getIdea(ideaId),
    getParticipants(ideaId),
    getIdeaMessages(ideaId)
  ]);

  if (!idea) {
    return;
  }

  const embed = buildProposalEmbed(idea.text, participants);
  const components = [buildProposalActions(ideaId)];

  for (const link of links) {
    try {
      const channel = await client.channels.fetch(link.channel_id);
      if (!channel || channel.type !== ChannelType.GuildText) {
        await removeIdeaMessage(ideaId, link.message_id);
        continue;
      }

      const message = await channel.messages.fetch(link.message_id);
      await message.edit({ embeds: [embed], components });
    } catch {
      // Message deleted or inaccessible; remove stale link and continue.
      await removeIdeaMessage(ideaId, link.message_id);
    }
  }
}

async function handlePropose(interaction) {
  const text = interaction.options.getString('text', true).trim();
  const idea = await createIdea(interaction.user.id, text);

  const embed = buildProposalEmbed(idea.text, []);
  const components = [buildProposalActions(idea.idea_id)];

  await interaction.reply({ embeds: [embed], components });
  const message = await interaction.fetchReply();

  await addIdeaMessage({
    ideaId: idea.idea_id,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    messageId: message.id
  });
}

async function handleJoin(interaction, ideaId) {
  const idea = await getIdea(ideaId);
  if (!idea) {
    await interaction.reply({
      content: 'This proposal was not found.',
      ephemeral: true
    });
    return;
  }

  await toggleParticipant(ideaId, interaction.user.id);
  await interaction.deferUpdate();
  await syncAllMessagesForIdea(ideaId);
}

async function handleForward(interaction, ideaId) {
  const idea = await getIdea(ideaId);
  if (!idea) {
    await interaction.reply({
      content: 'This proposal was not found.',
      ephemeral: true
    });
    return;
  }

  if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) {
    await interaction.reply({
      content: 'This can only be used in a text channel.',
      ephemeral: true
    });
    return;
  }

  const me = interaction.guild.members.me;
  const perms = interaction.channel.permissionsFor(me);
  const required = [
    PermissionsBitField.Flags.ViewChannel,
    PermissionsBitField.Flags.SendMessages,
    PermissionsBitField.Flags.EmbedLinks
  ];

  if (!perms?.has(required)) {
    await interaction.reply({
      content: 'I do not have permission to send embeds in this channel.',
      ephemeral: true
    });
    return;
  }

  const posted = await interaction.channel.send({
    embeds: [buildProposalEmbed(idea.text, await getParticipants(ideaId))],
    components: [buildProposalActions(ideaId)]
  });

  await addIdeaMessage({
    ideaId,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    messageId: posted.id
  });

  await interaction.reply({ content: 'Forwarded to this channel and synced.', ephemeral: true });
}

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'propose') {
        await handlePropose(interaction);
      }
      return;
    }

    if (interaction.isButton()) {
      const { action, ideaId } = parseCustomId(interaction.customId);
      if (!ideaId) {
        await interaction.reply({ content: 'Invalid action payload.', ephemeral: true });
        return;
      }

      if (action === 'join') {
        await handleJoin(interaction, ideaId);
        return;
      }

      if (action === 'forward') {
        await handleForward(interaction, ideaId);
      }
    }
  } catch (error) {
    console.error(error);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'Something went wrong while processing your action.',
        ephemeral: true
      });
    }
  }
});

client.login(config.discordToken);
