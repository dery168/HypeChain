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
  getIdea,
  getIdeaMessages,
  getParticipants,
  removeIdeaMessage,
  toggleParticipant,
  updateIdeaText
} from './db.js';
import { buildProposalActions, buildProposalEmbed } from './embed.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
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

  if (idea.creator_id !== interaction.user.id) {
    await interaction.reply({
      content: 'Only the proposal creator can forward it.',
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
      content: 'Only the proposal creator can cancel it.',
      ephemeral: true
    });
    return;
  }

  await deleteIdea(ideaId);
  await interaction.reply({ content: 'Proposal cancelled and removed from all channels.', ephemeral: true });
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
  // Don't respond to bot messages or our own messages
  if (message.author.bot) return;

  // Log that we received a message for debugging
  console.log(`Received message from ${message.author.username}: ${message.content || '[no content]'}`);

  // Random chance to respond (about 50% of messages) for testing - reduce later to avoid spam
  if (Math.random() > 0.5) {
    console.log('Skipping response due to random chance');
    return;
  }

  try {
    console.log('Attempting to reply to message...');
    await message.reply('Add me to your server and type `/propose` to meet up your friends! https://github.com/dery168/HypeChain.');
    console.log('Successfully sent promotional message');
  } catch (error) {
    console.error('Error sending promotional message:', error);
  }
});

client.login(config.discordToken);
