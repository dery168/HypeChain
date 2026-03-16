import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

export function buildProposalEmbed(ideaText, participants) {
  const participantText = participants.length
    ? participants.map((p) => `<@${p.user_id}>`).join('\n')
    : 'No one yet';

  return new EmbedBuilder()
    .setTitle('Hype Chain Proposal')
    .setDescription(ideaText)
    .addFields({ name: 'Participants', value: participantText });
}

export function buildProposalActions(ideaId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`join:${ideaId}`)
      .setLabel('Join / Leave')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`forward:${ideaId}`)
      .setLabel('Forward Here')
      .setStyle(ButtonStyle.Primary)
  );
}
