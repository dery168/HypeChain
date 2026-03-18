import {
  ChannelType,
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder
} from 'discord.js';
import { config } from './config.js';
import {
  addIdeaMessage,
  createIdea,
  deleteIdea,
  deleteIdeaMessages,
  getIdea,
  getIdeaMessages,
  getParticipants,
  removeIdeaMessage,
  toggleParticipant,
  updateIdeaState,
  updateIdeaText
} from './db.js';
import { buildProposalActions, buildProposalEmbed } from './embed.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages]
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

  const embed = buildProposalEmbed(idea.text, participants, idea.state);
  const components = [buildProposalActions(ideaId, idea.state)];

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

  const embed = buildProposalEmbed(idea.text, [], idea.state);
  const components = [buildProposalActions(idea.idea_id, idea.state)];

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

  if (idea.state === 'cancelled') {
    await interaction.reply({
      content: 'This proposal is cancelled. Reactivate it before joining.',
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

  if (idea.creator_id !== interaction.user.id) {
    await interaction.reply({
      content: 'Only the proposal creator can forward it.',
      ephemeral: true
    });
    return;
  }

  if (idea.state === 'cancelled') {
    await interaction.reply({
      content: 'Cannot forward a cancelled proposal. Reactivate first.',
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
    embeds: [buildProposalEmbed(idea.text, await getParticipants(ideaId), idea.state)],
    components: [buildProposalActions(ideaId, idea.state)]
  });

  await addIdeaMessage({
    ideaId,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    messageId: posted.id
  });

  await interaction.reply({ content: 'Forwarded to this channel and synced.', ephemeral: true });
}

async function handleCancel(interaction, ideaId) {
  const idea = await getIdea(ideaId);
  if (!idea) {
    await interaction.reply({
      content: 'This proposal was not found.',
      ephemeral: true
    });
    return;
  }

  if (idea.creator_id !== interaction.user.id) {
    await interaction.reply({
      content: 'Only the proposal creator can cancel/reactivate it.',
      ephemeral: true
    });
    return;
  }

  const newState = idea.state === 'cancelled' ? 'active' : 'cancelled';
  await updateIdeaState(ideaId, newState);

  await interaction.deferUpdate();
  await syncAllMessagesForIdea(ideaId);

  await interaction.followUp({
    content: newState === 'cancelled'
      ? 'Proposal is now cancelled. Reactivate to reopen.'
      : 'Proposal is now active again.',
    ephemeral: true
  });
}

async function handleModify(interaction, ideaId) {
  const idea = await getIdea(ideaId);
  if (!idea) {
    await interaction.reply({
      content: 'This proposal was not found.',
      ephemeral: true
    });
    return;
  }

  if (idea.creator_id !== interaction.user.id) {
    await interaction.reply({
      content: 'Only the proposal creator can modify it.',
      ephemeral: true
    });
    return;
  }

  if (idea.state === 'cancelled') {
    await interaction.reply({
      content: 'Cannot modify a cancelled proposal. Reactivate first.',
      ephemeral: true
    });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`modify_modal:${ideaId}`)
    .setTitle('Modify Proposal');

  const textInput = new TextInputBuilder()
    .setCustomId('new_text')
    .setLabel('New proposal text')
    .setStyle(TextInputStyle.Paragraph)
    .setValue(idea.text)
    .setRequired(true)
    .setMaxLength(500);

  const actionRow = new ActionRowBuilder().addComponents(textInput);
  modal.addComponents(actionRow);

  await interaction.showModal(modal);
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

    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith('modify_modal:')) {
        const ideaId = interaction.customId.split(':')[1];
        const newText = interaction.fields.getTextInputValue('new_text').trim();

        if (!newText) {
          await interaction.reply({
            content: 'Proposal text cannot be empty.',
            ephemeral: true
          });
          return;
        }

        await updateIdeaText(ideaId, newText);
        await interaction.reply({ content: 'Proposal updated and synced across all channels.', ephemeral: true });
        await syncAllMessagesForIdea(ideaId);
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
        return;
      }

      if (action === 'cancel') {
        await handleCancel(interaction, ideaId);
        return;
      }

      if (action === 'modify') {
        await handleModify(interaction, ideaId);
        return;
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

client.on('messageCreate', async (message) => {
  // Log ALL messages for debugging
  console.log(`Message received - Guild: ${message.guild ? message.guild.name : 'DM'}, Author: ${message.author.username}, Content: ${message.content || '[no content]'}`);

  // Only respond in DMs, not in server channels
  if (message.guild) {
    console.log('Ignoring message from server channel');
    return;
  }

  console.log('Message is in DM channel');

  // Don't respond to bot messages or our own messages
  if (message.author.bot) {
    console.log('Ignoring message from bot');
    return;
  }

  console.log('Message is from a user, not a bot');

  // For testing, respond to EVERY DM (remove random chance)
  // if (Math.random() > 0.5) {
  //   console.log('Skipping response due to random chance');
  //   return;
  // }

  try {
    console.log('Attempting to reply to DM...');
    await message.reply('Add me to your server and type `/propose` to meet up your friends! https://github.com/dery168/HypeChain.');
    console.log('Successfully sent promotional message');
  } catch (error) {
    console.error('Error sending promotional message:', error);
    console.error('Error details:', error.message);
  }
});

client.login(config.discordToken);
