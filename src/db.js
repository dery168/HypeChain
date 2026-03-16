import { supabase } from './supabase.js';

export async function createIdea(creatorId, text) {
  const { data, error } = await supabase
    .from('ideas')
    .insert({ creator_id: creatorId, text })
    .select('idea_id, text')
    .single();

  if (error) throw error;
  return data;
}

export async function addIdeaMessage({ ideaId, guildId, channelId, messageId }) {
  const { error } = await supabase.from('idea_messages').insert({
    idea_id: ideaId,
    guild_id: guildId,
    channel_id: channelId,
    message_id: messageId
  });

  if (error) throw error;
}

export async function toggleParticipant(ideaId, userId) {
  const { data: existing, error: selectError } = await supabase
    .from('idea_participants')
    .select('idea_id')
    .eq('idea_id', ideaId)
    .eq('user_id', userId)
    .maybeSingle();

  if (selectError) throw selectError;

  if (existing) {
    const { error } = await supabase
      .from('idea_participants')
      .delete()
      .eq('idea_id', ideaId)
      .eq('user_id', userId);
    if (error) throw error;
    return 'left';
  }

  const { error } = await supabase
    .from('idea_participants')
    .insert({ idea_id: ideaId, user_id: userId });
  if (error) throw error;
  return 'joined';
}

export async function getIdea(ideaId) {
  const { data, error } = await supabase
    .from('ideas')
    .select('idea_id, text')
    .eq('idea_id', ideaId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getParticipants(ideaId) {
  const { data, error } = await supabase
    .from('idea_participants')
    .select('user_id')
    .eq('idea_id', ideaId)
    .order('joined_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function getIdeaMessages(ideaId) {
  const { data, error } = await supabase
    .from('idea_messages')
    .select('channel_id, message_id')
    .eq('idea_id', ideaId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function removeIdeaMessage(ideaId, messageId) {
  const { error } = await supabase
    .from('idea_messages')
    .delete()
    .eq('idea_id', ideaId)
    .eq('message_id', messageId);

  if (error) throw error;
}
