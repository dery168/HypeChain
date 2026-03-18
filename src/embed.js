import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

export function buildProposalEmbed(ideaText, participants, state = 'active') {
  const participantText = participants.length
    ? participants.map((p) => `<@${p.user_id}>`).join('\n')
    : 'No one yet';

  const embed = new EmbedBuilder()
    .setTitle('Hype Chain Proposal')
    .setDescription(ideaText)
    .addFields({ name: 'Participants', value: participantText });

  if (state === 'cancelled') {
    embed.setColor(0xff0000);
    embed.addFields({ name: 'Status', value: 'Cancelled' });
  } else {
    embed.setColor(0x00ff00);
  }

  return embed;
}

export function buildProposalActions(ideaId, state = 'active') {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`join:${ideaId}`)
      .setLabel('Join / Leave')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`forward:${ideaId}`)
      .setLabel('Forward Here')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`modify:${ideaId}`)
      .setLabel('Modify')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`cancel:${ideaId}`)
      .setLabel(state === 'cancelled' ? 'Reopen' : 'Cancel')
      .setStyle(ButtonStyle.Danger)
  );
}
